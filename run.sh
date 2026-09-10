#!/bin/bash

port=${1:-11320}
if [[ -f .venv/bin/python ]]; then
    python=.venv/bin/python
else
    python=.venv/Scripts/python
fi
"$python" -m uvicorn main:app --host 127.0.0.1 --port "$port"
