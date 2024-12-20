/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseType,
  InteractionType,
  verifyKey
} from 'discord-interactions';
import Together from 'together-ai';
import { CHAT_COMMAND, PING_COMMAND, TEMPLATE_COMMAND } from './commands';

class JsonResponse extends Response {
  constructor(body: unknown, init?: ResponseInit) {
    const jsonBody = JSON.stringify(body);
    init = init || {
      headers: {
        'content-type': 'application/json;charset=UTF-8'
      }
    };
    super(jsonBody, init);
  }
}

const router = AutoRouter();
const together = new Together();

/**
 * A simple hello page to verify the worker is working.
 */
router.get('/', () => {
  return new Response(`Hello World`);
});

router.post('/', async (request, env) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env,
  );
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the developer portal.
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    // Most user commands will come as `APPLICATION_COMMAND`.
    switch (interaction.data.name.toLowerCase()) {
      case PING_COMMAND.name.toLowerCase(): {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "Pong",
          },
        });
      }
      case TEMPLATE_COMMAND.name.toLowerCase(): {
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: "This command is currently just a placeholder."
          },
        });
      }
      case CHAT_COMMAND.name.toLowerCase(): {
        const promptOption = interaction.data.options?.find(
          (option: { name: string }) => option.name === "prompt"
        );
        const userPrompt = promptOption?.value;

        const aiResponse = await sendToAIProvider(userPrompt || "No input");
        return new JsonResponse({
          type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: aiResponse
          },
        });
      }
      default:
        return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
    }
  }

  console.error('Unknown Type');
  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});
router.all('*', () => new Response('Not Found.', { status: 404 }));

async function verifyDiscordRequest(request: Request, env: { DISCORD_PUBLIC_KEY: string }) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValidRequest =
    signature &&
    timestamp &&
    (await verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY));
  if (!isValidRequest) {
    return { isValid: false };
  }

  return { interaction: JSON.parse(body), isValid: true };
}

const server = {
  verifyDiscordRequest,
  fetch: router.fetch
};

async function sendToAIProvider(prompt: string): Promise<string> {
  const response = await together.chat.completions.create({
    model: "meta-llama/Llama-Vision-Free",
    messages: [{ role: "user", content: prompt }],
  });

  if (response.choices && response.choices[0] && response.choices[0].message) {
    return response.choices[0].message.content || "No response";
  }
  return "No response";
}
export default server;
