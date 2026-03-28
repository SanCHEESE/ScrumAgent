FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY scrum_agent_gcp.py .
COPY core.py mcp_clients.py ./
COPY modules/ modules/
CMD ["python", "scrum_agent_gcp.py"]
