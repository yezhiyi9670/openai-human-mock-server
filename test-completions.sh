curl http://127.0.0.1:11320/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer unused" \
  -d '{
    "model": "mock-model",
    "messages": [
      {"role": "user", "content": "Hello, fake model!"}
    ]
  }'
