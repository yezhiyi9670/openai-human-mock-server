# uvicorn main:app --host 127.0.0.1 --port 11320
# http://localhost:11320/

from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.responses import (
    HTMLResponse,
    JSONResponse,
    RedirectResponse,
    StreamingResponse,
)
import asyncio
import html
import json
import time
import uuid
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Any, Optional

app = FastAPI(title="Human OpenAI mock")

# Pending requests waiting for a human response.
PENDING = {}

def build_chat_payload(body: dict, user_response: str) -> dict:
    """
    Accepts either plain assistant text or a full OpenAI-style JSON response.

    Examples of user_response:

    Plain text:
        Hello, I am pretending to be the model.

    Full JSON:
        {
          "choices": [
            {
              "message": {
                "role": "assistant",
                "content": "Hello"
              },
              "finish_reason": "stop"
            }
          ]
        }

    Tool-call JSON:
        {
          "choices": [
            {
              "message": {
                "role": "assistant",
                "content": null,
                "tool_calls": [
                  {
                    "id": "call_123",
                    "type": "function",
                    "function": {
                      "name": "get_weather",
                      "arguments": "{\"city\": \"Paris\"}"
                    }
                  }
                ]
              },
              "finish_reason": "tool_calls"
            }
          ]
        }
    """

    text = user_response.strip()

    try:
        parsed = json.loads(text)

        # If the user pasted a full OpenAI-style response, use it directly.
        if isinstance(parsed, dict) and "choices" in parsed:
            return parsed

        # If the user pasted something like {"message": {...}}, wrap it.
        if isinstance(parsed, dict) and "message" in parsed:
            message = parsed["message"]
        elif isinstance(parsed, dict) and parsed.get("role") == "assistant":
            message = parsed
        else:
            message = {"role": "assistant", "content": text}

    except json.JSONDecodeError:
        message = {"role": "assistant", "content": text}

    finish_reason = "tool_calls" if message.get("tool_calls") else "stop"

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": body.get("model", "mock-model"),
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": finish_reason,
            }
        ],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        },
    }


def make_response(body: dict, payload: dict):
    """
    Returns either a normal JSON response or a minimal SSE streaming response.
    This does not simulate realistic token-by-token streaming; it sends the
    manually entered answer as one chunk.
    """

    if not body.get("stream"):
        return JSONResponse(payload)

    message = payload["choices"][0].get("message", {})
    finish_reason = payload["choices"][0].get("finish_reason", "stop")

    base = {
        "id": payload.get("id", f"chatcmpl-{uuid.uuid4().hex[:24]}"),
        "object": "chat.completion.chunk",
        "created": payload.get("created", int(time.time())),
        "model": payload.get("model", "mock-model"),
    }

    async def event_stream():
        first = {
            **base,
            "choices": [
                {
                    "index": 0,
                    "delta": {"role": "assistant", "content": ""},
                    "finish_reason": None,
                }
            ],
        }
        yield f"data: {json.dumps(first, ensure_ascii=False)}\n\n"

        if message.get("content"):
            chunk = {
                **base,
                "choices": [
                    {
                        "index": 0,
                        "delta": {"content": message["content"]},
                        "finish_reason": None,
                    }
                ],
            }
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        if message.get("tool_calls"):
            chunk = {
                **base,
                "choices": [
                    {
                        "index": 0,
                        "delta": {"tool_calls": message["tool_calls"]},
                        "finish_reason": None,
                    }
                ],
            }
            yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"

        last = {
            **base,
            "choices": [
                {
                    "index": 0,
                    "delta": {},
                    "finish_reason": finish_reason,
                }
            ],
        }
        yield f"data: {json.dumps(last, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/v1/models")
def models():
    return {
        "object": "list",
        "data": [
            {
                "id": "mock-model",
                "object": "model",
                "created": 0,
                "owned_by": "human-mock",
            }
        ],
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()

    request_id = uuid.uuid4().hex[:8]
    future = asyncio.get_running_loop().create_future()

    PENDING[request_id] = {
        "id": request_id,
        "path": "/v1/chat/completions",
        "body": body,
        "future": future,
        "received_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    print("\n=== Received OpenAI-compatible request ===")
    print(f"Request ID: {request_id}")
    print(json.dumps(body, indent=2, ensure_ascii=False))
    print("Answer it with webpage.")

    # Wait until the human submits a response from the web UI.
    response = await future

    PENDING.pop(request_id, None)
    return response

def make_responses_message_item(text: str) -> dict:
    """
    Create a Responses API message output item from plain text.
    """
    return {
        "id": f"msg_{uuid.uuid4().hex[:24]}",
        "type": "message",
        "status": "completed",
        "role": "assistant",
        "content": [
            {
                "type": "output_text",
                "text": text,
            }
        ],
    }


def normalize_responses_output(parsed):
    """
    Try to interpret pasted JSON as Responses API output.

    Supports:
      - a full list of output items
      - one output item dict
      - {"text": "..."}
      - {"role": "assistant", "content": [...]}
    """
    if isinstance(parsed, list):
        return parsed

    if isinstance(parsed, dict):
        # A single Responses API output item.
        if parsed.get("type") in {
            "message",
            "function_call",
            "reasoning",
            "file_search",
            "computer_call",
        }:
            return [parsed]

        # Simple shortcut: {"text": "assistant reply"}
        if "text" in parsed:
            return [make_responses_message_item(str(parsed["text"]))]

        # Simple message-like object without type.
        if parsed.get("role") == "assistant" and "content" in parsed:
            return [
                {
                    "id": f"msg_{uuid.uuid4().hex[:24]}",
                    "type": "message",
                    "status": "completed",
                    "role": "assistant",
                    "content": parsed["content"],
                }
            ]

    return None


def build_responses_payload(body: dict, user_response: str) -> dict:
    """
    Build a Responses API payload from what the human typed.

    If the human types plain text, wrap it as an assistant message.
    If the human pastes JSON:
      - if it has "output", treat it as a full/partial Responses API response
      - otherwise try to interpret it as output item(s)
    """
    text = user_response.strip()
    output = None
    full_override = None

    try:
        parsed = json.loads(text)

        if isinstance(parsed, dict) and "output" in parsed:
            full_override = parsed
            output = parsed.get("output")
        else:
            output = normalize_responses_output(parsed)

    except json.JSONDecodeError:
        output = None

    if not isinstance(output, list):
        output = [make_responses_message_item(text)]

    payload = {
        "id": f"resp_{uuid.uuid4().hex[:24]}",
        "object": "response",
        "created_at": int(time.time()),
        "status": "completed",
        "model": body.get("model", "mock-model"),
        "output": output,
        "usage": {
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
        },
    }

    if isinstance(full_override, dict):
        payload.update(full_override)

        # If the user-provided override has an invalid output field,
        # fall back to the generated one.
        if not isinstance(payload.get("output"), list):
            payload["output"] = output

    payload.setdefault("id", f"resp_{uuid.uuid4().hex[:24]}")
    payload.setdefault("object", "response")
    payload.setdefault("created_at", int(time.time()))
    payload.setdefault("status", "completed")
    payload.setdefault("model", body.get("model", "mock-model"))

    return payload


def make_responses_api_response(body: dict, payload: dict):
    """
    Return either a normal Responses API JSON response or a best-effort
    streaming SSE response.

    Note:
      Responses API streaming has more event types than Chat Completions.
      This implementation emits a reasonable sequence of events, but if you
      are testing a very strict SDK streaming parser, you may prefer to
      disable streaming during manual testing.
    """

    if not body.get("stream"):
        return JSONResponse(payload)

    async def event_stream():
        def sse(event: str, data: dict) -> str:
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        started = dict(payload)
        started["status"] = "in_progress"
        started["output"] = []

        yield sse(
            "response.created",
            {
                "type": "response.created",
                "response": started,
            },
        )

        yield sse(
            "response.in_progress",
            {
                "type": "response.in_progress",
                "response": started,
            },
        )

        for output_index, item in enumerate(payload.get("output", [])):
            item = dict(item)
            item.setdefault("id", f"item_{uuid.uuid4().hex[:24]}")
            item.setdefault("status", "completed")

            yield sse(
                "response.output_item.added",
                {
                    "type": "response.output_item.added",
                    "output_index": output_index,
                    "item": item,
                },
            )

            if item.get("type") == "message":
                for content_index, part in enumerate(item.get("content", [])):
                    part = dict(part)
                    part.setdefault("type", "output_text")

                    yield sse(
                        "response.content_part.added",
                        {
                            "type": "response.content_part.added",
                            "item_id": item.get("id"),
                            "output_index": output_index,
                            "content_index": content_index,
                            "part": part,
                        },
                    )

                    if part.get("type") == "output_text":
                        text = part.get("text", "")

                        yield sse(
                            "response.output_text.delta",
                            {
                                "type": "response.output_text.delta",
                                "item_id": item.get("id"),
                                "output_index": output_index,
                                "content_index": content_index,
                                "delta": text,
                            },
                        )

                        yield sse(
                            "response.output_text.done",
                            {
                                "type": "response.output_text.done",
                                "item_id": item.get("id"),
                                "output_index": output_index,
                                "content_index": content_index,
                                "text": text,
                            },
                        )

                    yield sse(
                        "response.content_part.done",
                        {
                            "type": "response.content_part.done",
                            "item_id": item.get("id"),
                            "output_index": output_index,
                            "content_index": content_index,
                            "part": part,
                        },
                    )

            yield sse(
                "response.output_item.done",
                {
                    "type": "response.output_item.done",
                    "output_index": output_index,
                    "item": item,
                },
            )

        yield sse(
            "response.completed",
            {
                "type": "response.completed",
                "response": payload,
            },
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
    )

@app.post("/v1/responses")
async def responses_endpoint(request: Request):
    body = await request.json()

    request_id = uuid.uuid4().hex[:8]
    future = asyncio.get_running_loop().create_future()

    PENDING[request_id] = {
        "id": request_id,
        "path": "/v1/responses",
        "body": body,
        "future": future,
        "received_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }

    print("\n=== Received Responses API request ===")
    print(f"Request ID: {request_id}")
    print(json.dumps(body, indent=2, ensure_ascii=False))
    print("Answer it with webpage.")

    # Wait until the human submits a response from the web UI.
    response = await future

    PENDING.pop(request_id, None)
    return response

class MockRespondBody(BaseModel):
    payload: Any = ""

class MockRejectBody(BaseModel):
    message: Optional[str] = None

def serialize_user_response(value: Any) -> str:
    """
    Convert the JSON API response value into the string format expected
    by the existing builders.
    """
    if value is None:
        return ""

    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)

    return str(value)


def answer_pending_request(request_id: str, response_value: Any) -> dict:
    item = PENDING.get(request_id)

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Unknown or already answered request",
        )

    future = item.get("future")

    if future is None or future.done():
        PENDING.pop(request_id, None)
        raise HTTPException(
            status_code=409,
            detail="Request already answered or cannot be answered",
        )

    response_text = serialize_user_response(response_value)

    body = item.get("body") if isinstance(item.get("body"), dict) else {}

    if item.get("path") == "/v1/responses":
        payload = build_responses_payload(body, response_text)
        result = make_responses_api_response(body, payload)
    else:
        payload = build_chat_payload(body, response_text)

        # If your Chat Completions response builder is named make_response,
        # keep this as-is.
        #
        # If you renamed it to make_chat_response, change this line.
        result = make_response(body, payload)

    future.set_result(result)

    # Remove it immediately so the JSON API and frontend do not keep showing it.
    PENDING.pop(request_id, None)

    return {
        "ok": True,
        "request_id": request_id,
        "path": item.get("path"),
        "stream": bool(body.get("stream")),
        "sent_payload": payload,
    }

def make_mock_error_response(
    message: str = "Mock request rejected",
    status_code: int = 503,
    error_type: str = "mock_error",
    code: str = "mock_rejected",
) -> JSONResponse:
    """
    Create an OpenAI-style error response.

    The original waiting client will receive this as an HTTP error.
    """
    return JSONResponse(
        status_code=status_code,
        content={
            "error": {
                "message": message,
                "type": error_type,
                "code": code,
                "param": None,
            }
        },
    )


def reject_pending_request(
    request_id: str,
    message: Optional[str] = None,
) -> dict:
    """
    Reject one pending request.

    The pending request is removed from PENDING, and the original waiting
    client receives an HTTP 503 JSON error.
    """
    item = PENDING.get(request_id)

    if not item:
        raise HTTPException(
            status_code=404,
            detail="Unknown or already answered request",
        )

    future = item.get("future")

    if future is None or future.done():
        PENDING.pop(request_id, None)
        raise HTTPException(
            status_code=409,
            detail="Request already answered or cannot be rejected",
        )

    error_message = message or f"Mock request {request_id} rejected"

    result = make_mock_error_response(
        message=error_message,
        status_code=503,
        error_type="mock_error",
        code="mock_rejected",
    )

    future.set_result(result)

    PENDING.pop(request_id, None)

    return {
        "ok": True,
        "request_id": request_id,
        "path": item.get("path"),
        "status_code": 503,
        "error_message": error_message,
    }

@app.get("/__mock/api/requests")
def api_requests():
    requests = []

    for request_id, item in PENDING.items():
        body = item.get("body") if isinstance(item.get("body"), dict) else {}

        requests.append(
            {
                "id": item.get("id", request_id),
                "path": item.get("path"),
                "received_at": item.get("received_at"),
                "stream": bool(body.get("stream")),
                "body": body,
            }
        )

    return {
        "requests": requests,
    }

@app.post("/__mock/api/reject/{request_id}")
async def api_reject_request(
    request_id: str,
    body: Optional[MockRejectBody] = None,
):
    message = body.message if body else None
    return reject_pending_request(request_id, message)

@app.post("/__mock/api/reject-all")
async def api_reject_all_requests(
    body: Optional[MockRejectBody] = None,
):
    rejected = []
    skipped = []

    base_message = body.message if body else None

    # Copy items because we mutate PENDING while iterating.
    for request_id, item in list(PENDING.items()):
        future = item.get("future")

        if future is not None and not future.done():
            error_message = base_message or f"Mock request {request_id} rejected"

            result = make_mock_error_response(
                message=error_message,
                status_code=503,
                error_type="mock_error",
                code="mock_rejected",
            )

            future.set_result(result)
            PENDING.pop(request_id, None)

            rejected.append(request_id)
        else:
            # Already answered, cancelled, or otherwise not rejectable.
            PENDING.pop(request_id, None)
            skipped.append(request_id)

    return {
        "ok": True,
        "rejected": rejected,
        "skipped": skipped,
        "status_code": 503,
    }

@app.get("/__mock/legacy", response_class=HTMLResponse)
def mock_ui():
    if not PENDING:
        items = "<p>No pending requests. Refresh after sending a request.</p>"
    else:
        parts = []

        for req_id, item in PENDING.items():
            body_json = html.escape(
                json.dumps(item["body"], indent=2, ensure_ascii=False)
            )

            parts.append(
                f"""
                <div style="border:1px solid #999; border-radius:8px; padding:16px; margin:16px 0;">
                  <h2 style="margin-top:0;">Request {req_id}</h2>
                  <p>Received: {item['received_at']}</p>
                  <pre style="background:#f6f6f6; padding:12px; overflow:auto;">{body_json}</pre>

                  <form method="post" action="/__mock/respond/{req_id}">
                    <textarea
                      name="response"
                      rows="10"
                      style="width:100%; font-family:monospace;"
                      placeholder="Plain assistant text, or full OpenAI-style JSON"
                    ></textarea>

                    <div style="margin-top:8px;">
                      <button type="submit">Send response</button>
                    </div>
                  </form>
                </div>
                """
            )

        items = "".join(parts)

    return f"""
    <html>
      <head>
        <title>Human OpenAI mock</title>
      </head>
      <body style="font-family:sans-serif; max-width:1000px; margin:24px auto;">
        <h1>Human OpenAI mock</h1>
        <p>
          Send a request to <code>/v1/chat/completions</code>, then answer it here.
          <a href="/__mock/legacy">Refresh</a>
        </p>
        {items}
      </body>
    </html>
    """

@app.post("/__mock/api/respond/{request_id}")
async def api_respond(request_id: str, body: MockRespondBody):
    return answer_pending_request(request_id, body.payload)

@app.post("/__mock/respond/{request_id}")
async def respond(request_id: str, response: str = Form(...)):
    answer_pending_request(request_id, response)
    return RedirectResponse(url="/__mock/legacy", status_code=303)

app.mount('/__mock', StaticFiles(directory="static", html=True))

@app.get("/")
def root_page_redirect():
    return RedirectResponse(url="/__mock/", status_code=302)
