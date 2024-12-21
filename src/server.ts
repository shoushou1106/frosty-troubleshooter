/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseType,
  InteractionType,
  verifyKey
} from 'discord-interactions';
import { APIInteraction } from 'discord-api-types/v10';
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

// Environment variables that is set in Cloudflare Workers
interface Env {
  DISCORD_APPLICATION_ID: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_TOKEN: string;
  TOGETHER_API_KEY: string;
}

const router = AutoRouter();

/**
 * A simple hello page to verify the worker is working.
 */
router.get('/', () => {
  return new Response(`Hello World`);
});

router.post('/', async (request, env: Env) => {
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

        // Send an initial response to answer the command
        const initialResponse = await fetch(
          `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
            }),
          }
        );

        const justatestidk = await fetch(
          `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              type: InteractionResponseType.UPDATE_MESSAGE,
              data: {
                content: "test update",
              },
            }),
          }
        );

        if (!initialResponse.ok) {
          console.error("Failed to send initial response:", initialResponse.statusText);
          return new JsonResponse(
            { error: "Failed to send initial response" },
            { status: 500 }
          );
        }

        // Stream the AI response and update the message
        await streamFromAI(interaction, userPrompt, env);

        return new Response();
      }
      default:
        return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
    }
  }

  console.error('Unknown Type');
  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});
router.all('*', () => new Response('Not Found.', { status: 404 }));

async function verifyDiscordRequest(request: Request, env: Env) {
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

async function streamFromAI(interaction: APIInteraction, prompt: string, env: Env): Promise<void> {
  // const together = new Together({ apiKey: api_key });
  // const response = await together.chat.completions.create({
  //   model: "meta-llama/Llama-Vision-Free",
  //   messages: [{ role: "user", content: prompt }],
  // });
  //
  // if (response.choices && response.choices[0] && response.choices[0].message) {
  //   return response.choices[0].message.content || "No response";
  // }
  // return "No response";



  try {
    const together = new Together({ apiKey: env.TOGETHER_API_KEY });

    const stream = await together.chat.completions.create({
      model: "meta-llama/Llama-Vision-Free",
      messages: [{ role: "user", content: prompt }],
      stream: true, // Enable streaming
    });

    let aiResponse = "";

    for await (const chunk of stream) {
      aiResponse += chunk.choices[0].delta.content || "";

      // Update the message with the current AI response
      await fetch(
        `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
            data: {
              content: aiResponse || '' + '\n*Generating...*\n-# This message was generated by AI. Results may be wrong.',
            },
          }),
        }
      );
    }
    await fetch(
      `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
          data: {
            content: aiResponse || '' + '\n-# This message was generated by AI. Results may be wrong.',
          },
        }),
      }
    );
  } catch (error) {
    console.error("Error fetching AI response: ", error);

    // Handle errors by updating the message
    await fetch(
      `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "An error occurred.\n" + error,
        }),
      }
    );
  }
}
export default server;
