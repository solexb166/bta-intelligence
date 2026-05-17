import asyncio
from google import genai
import os
from dotenv import load_dotenv

load_dotenv()


class GeminiProvider:
    """
    GeminiProvider handles communication with Google's Gemini AI model.

    It supports chat-based generation using the "gemini-2.5-flash" model
    and runs synchronous API calls inside an async executor.
    """

    def __init__(self):
        """
        Initializes the Gemini client using the API key from environment variables.
        """
        self.client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

    async def generate(self, message: str, history: list = None) -> str:
        """
        Generates a response from the Gemini model.

        Args:
            message (str):
                The user input prompt.

            history (list, optional):
                Previous chat messages for context in the format expected by Gemini.
                Defaults to None.

        Returns:
            str:
                The generated response text from Gemini.

        Raises:
            Exception:
                If the model returns an empty or invalid response.
        """
        chat = self.client.chats.create(model="gemini-2.5-pro", history=history or [])

        response = await asyncio.get_event_loop().run_in_executor(
            None, lambda: chat.send_message(message)
        )

        text = response.text

        if not text or not text.strip():
            raise Exception("Empty Gemini response")

        return text
