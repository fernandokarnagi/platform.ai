import httpx


class OpenAIProxyError(Exception):
    pass


def normalize_base_url(url: str) -> str:
    return (url or "").rstrip("/")


async def fetch_models(base_url: str, api_key: str) -> list[dict]:
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{normalize_base_url(base_url)}/models", headers=headers)
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        raise OpenAIProxyError(str(exc)) from exc
    return data.get("data") or []


async def chat_completions(base_url: str, api_key: str, payload: dict) -> dict:
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{normalize_base_url(base_url)}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as exc:
        body = (exc.response.text or "").strip()[:2000]
        raise OpenAIProxyError(body or str(exc)) from exc
    except Exception as exc:
        raise OpenAIProxyError(str(exc)) from exc
