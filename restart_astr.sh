#!/bin/bash

cwd="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if screen -list | grep -q "astr"; then
    screen -X -S "astr" quit
fi
screen -d -m -S "astr" bash -c "
    cd '${cwd}/AstrBot' && \
    rm -f data/data_v4.db-shm data/data_v4.db-wal data/fish.db-shm data/fish.db-wal && \
    source venv/bin/activate && \
    python main.py
"


