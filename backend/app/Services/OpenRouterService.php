<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Thin wrapper over the OpenRouter chat-completions API.
 *
 * Used on-demand from the admin to draft location copy (descriptions, tier
 * rationales, etc.) from the enriched Google Places data. The key + model come
 * from config('services.openrouter.*') — never hardcoded. OpenRouter recommends
 * sending HTTP-Referer + X-Title so requests are attributable to the app; both
 * are set from the app config below.
 */
class OpenRouterService
{
    private const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

    /**
     * Run a single prompt (with an optional system message) and return the
     * assistant's text. Throws a clear RuntimeException on any failure so the
     * calling UI can catch + surface it.
     */
    public function generate(string $prompt, ?string $system = null): string
    {
        $key = config('services.openrouter.key');
        if (! $key) {
            throw new \RuntimeException('OpenRouter API key not configured (OPENROUTER_API_KEY).');
        }

        $model = config('services.openrouter.model', 'anthropic/claude-3.5-haiku');

        $messages = [];
        if ($system !== null && trim($system) !== '') {
            $messages[] = ['role' => 'system', 'content' => $system];
        }
        $messages[] = ['role' => 'user', 'content' => $prompt];

        try {
            $response = Http::timeout(60)
                ->withToken($key)
                ->withHeaders([
                    // OpenRouter attribution headers (recommended).
                    'HTTP-Referer' => config('app.url', 'https://locatour.com.au'),
                    'X-Title' => config('app.name', 'Locatour'),
                ])
                ->post(self::ENDPOINT, [
                    'model' => $model,
                    'messages' => $messages,
                ]);
        } catch (\Throwable $e) {
            throw new \RuntimeException('OpenRouter request failed: ' . $e->getMessage(), 0, $e);
        }

        if (! $response->successful()) {
            throw new \RuntimeException(
                "OpenRouter request failed (HTTP {$response->status()}): "
                . $response->json('error.message', $response->body())
            );
        }

        $text = $response->json('choices.0.message.content');
        if (! is_string($text) || trim($text) === '') {
            throw new \RuntimeException('OpenRouter returned an empty response.');
        }

        return trim($text);
    }
}
