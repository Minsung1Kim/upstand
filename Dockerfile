FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y gcc && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY server/requirements.txt .
RUN pip install -r requirements.txt

# Copy application
COPY server/ .

# Set environment
ENV PYTHONUNBUFFERED=1

# Run the app
CMD ["python", "app.py"]