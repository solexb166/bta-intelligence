import anthropic
import os
from dotenv import load_dotenv

load_dotenv()


class AnthropicProvider:
    """
    AnthropicProvider handles communication with Anthropic's Claude models.

    It sends chat-style messages and returns generated responses.
    """

    def __init__(self):
        """
        Initializes the Anthropic client using the API key from environment variables.
        """
        self.client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

    async def generate(self, message: str, history: list = None) -> str:
        """
        Generates a response from the Anthropic Claude model.

        Args:
            message (str):
                The user input prompt.

            history (list, optional):
                Previous conversation messages in Claude-compatible format.
                Defaults to None.

        Returns:
            str:
                The generated response text from Claude.

        Raises:
            Exception:
                If the response is empty or contains no valid text content.
        """
        messages = history[:] if history else []
        messages.append({"role": "user", "content": message})

        response = self.client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=messages,
        )

        text_parts = [block.text for block in response.content if block.type == "text"]

        text = "\n".join(text_parts)

        if not text.strip():
            raise Exception("Empty Anthropic response")

        return text
