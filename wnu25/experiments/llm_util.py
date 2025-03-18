import os
import requests
from tenacity import (
    retry,
    wait_random_exponential,
    stop_after_attempt,
    retry_if_exception
)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

def is_retriable_error(exception):
    # Check if it's an HTTPError
    if isinstance(exception, requests.exceptions.HTTPError):
        # If it's 429 (rate limit) or a 5xx error, we retry
        status = exception.response.status_code if exception.response else None
        # If status is None, it means we didn't get a valid response
        if status is not None:
            if status == 429 or (status >= 500 and status < 600):
                return True
    # Check connection or timeout errors
    if isinstance(exception, requests.exceptions.ConnectionError):
        return True
    if isinstance(exception, requests.exceptions.Timeout):
        return True
    return False

@retry(
    retry=retry_if_exception(is_retriable_error),
    wait=wait_random_exponential(min=1, max=60),
    stop=stop_after_attempt(30),
    reraise=True
)
def call_openai(
    prompt: str,
    model: str = "gpt-4o",
    temperature: float = None,
    responseFormat: dict = None,
    max_completion_tokens: int = None
) -> str:
    """
    Calls the OpenAI ChatCompletion endpoint and returns the content of the first message choice.
    Retries on 429 (rate limit) or connection errors (DNS fail, etc.) up to 6 attempts.
    """
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {OPENAI_API_KEY}",
    }
    
    data = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    }
    if temperature is not None:
        data["temperature"] = temperature
    if responseFormat is not None:
        data["response_format"] = responseFormat
    if max_completion_tokens is not None:
        data["max_completion_tokens"] = max_completion_tokens

    # Increase timeout to handle slow responses
    response = requests.post(url, headers=headers, json=data, timeout=300)
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"].strip()
