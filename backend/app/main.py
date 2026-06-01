from fastapi import FastAPI

app = FastAPI(title="Kabanchik")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
