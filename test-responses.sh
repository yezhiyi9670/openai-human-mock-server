curl http://127.0.0.1:11320/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer unused" \
  -d '{
    "model": "mock-model",
    "input": "Hello from the Responses API"
  }'
