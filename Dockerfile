FROM node:18

# Install xdg-utils so "xdg-open" is available if needed
RUN apt-get update && apt-get install -y xdg-utils python3 python3-venv

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy the Python service and install dependencies
# Copy the Python service and install dependencies inside a virtual environment
COPY server/requirements.txt server/requirements.txt
RUN python3 -m venv server/venv && \
    server/venv/bin/pip install --no-cache-dir -r server/requirements.txt

COPY . .
