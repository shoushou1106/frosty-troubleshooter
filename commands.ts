/**
 * Share command metadata from a common spot to be used for both runtime and registration.
 */

export const PING_COMMAND = {
  name: 'ping',
  description: 'Test the bot status',
  dm_permission: false
};

export const TEMPLATE_COMMAND = {
  name: 'template',
  description: 'PLACEHOLDER, Fill in a template easier',
  dm_permission: false
};

export const CHAT_COMMAND = {
  name: 'chat',
  description: 'Ask AI',
  dm_permission: false,
  options: [
    {
      name: "prompt",
      description: "The message you want to send to the AI.",
      type: 3, // 3 = String
      required: true,
    },
  ],
};
