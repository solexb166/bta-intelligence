import asyncio
from .gemini_provider import GeminiProvider
from .anthropic_provider import AnthropicProvider
import logging

logger = logging.getLogger(__name__)


class AIService:
    """
    AIService provides a unified interface for generating AI responses
        using multiple LLM providers with automatic fallback and timeout control.

        Provider order:
            1. AnthropicProvider (primary)
            2. GeminiProvider (fallback)

        Primary provider:
            - AnthropicProvider

        Fallback provider:
            - GeminiProvider

        Behavior:
            - Attempts to generate a response using Anthropic first.
            - If Anthropic fails (error or timeout), it falls back to Gemini.
            - If all providers fail, an exception is raised.
    """

    def __init__(self):
        """
        Initializes AIService with Anthropic (primary) and Gemini (fallback) providers.
        """

        self.anthropic = AnthropicProvider()
        self.gemini = GeminiProvider()

    async def generate(self, message: str, history: list = None) -> str:
        """
        Generates an AI response using a prioritized provider list with fallback support.

        Execution flow:
            1. Attempt Anthropic generation with timeout control.
            2. If Anthropic fails (exception or timeout), fallback to Gemini.
            3. If all providers fail, raise a final exception.

        Args:
            message (str):
                The user input prompt to send to the AI.

            history (list, optional):
                Previous conversation messages for context.
                Defaults to None.

        Returns:
            str:
                The generated AI response from the first successful provider.

        Raises:
            Exception:
                Raised if all configured providers fail to produce a response.
        """

        providers = [
            ("anthropic", self.anthropic.generate),
            ("gemini", self.gemini.generate),
        ]

        last_error = None

        for name, provider in providers:
            try:
                logger.info(f"Trying {name}...")

                return await self._run_with_timeout(
                    provider(message, history), timeout=15, name=name
                )

            except Exception as e:
                last_error = e
                logger.warning(f"{name} failed → fallback: {e}")

        raise Exception(f"All providers failed: {last_error}")

    async def _run_with_timeout(self, coro, timeout: int, name: str):
        """
        Executes an asynchronous coroutine with a strict timeout and safe cancellation.

        This utility ensures provider calls do not hang indefinitely by enforcing
        a maximum execution time. If the timeout is exceeded or an error occurs,
        the task is safely cancelled to prevent background execution leaks.

        Args:
            coro (coroutine):
                The asynchronous operation to execute (e.g., LLM provider call).

            timeout (int):
                Maximum allowed execution time in seconds.

            name (str):
                Identifier for the provider (e.g., "anthropic", "gemini")
                used for logging and debugging.

        Returns:
            Any:
                The result returned by the successfully completed coroutine.

        Raises:
            asyncio.TimeoutError:
                If the coroutine does not complete within the specified timeout.

            Exception:
                Any exception raised by the underlying provider, including:
                - Authentication errors
                - Rate limits / quota issues
                - Network failures
                - HTTP or SDK errors

        Notes:
            - The running task is always cancelled on timeout or failure.
            - Exceptions are logged with provider context for observability.
        """

        task = asyncio.create_task(coro)

        try:
            return await asyncio.wait_for(task, timeout=timeout)

        except asyncio.TimeoutError:
            logger.warning(f"{name} timeout → cancelling task")
            task.cancel()

            try:
                await task
            except Exception as exce:
                logger.warning(
                    f"failed with error: {type(exce).__name__}",
                )

                pass
            raise

        except Exception as exce:

            logger.warning(
                f"{name} failed with error: {type(exce).__name__}",
            )
            task.cancel()
            raise
