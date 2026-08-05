import { config } from 'dotenv';
import { createPgClient } from '../src/lib/db/client';

config({ path: '.env.local', override: false });

const sql = createPgClient();

async function main() {
  const users = await sql`SELECT id, line_user_id, bot_state, created_at FROM line_users ORDER BY created_at DESC LIMIT 5`;
  console.log('line_users:', JSON.stringify(users, null, 2));

  const convs = await sql`SELECT id, line_user_id, mode, last_message_text, last_message_at FROM chat_conversations ORDER BY created_at DESC LIMIT 5`;
  console.log('conversations:', JSON.stringify(convs, null, 2));

  const msgs = await sql`SELECT id, conversation_id, sender, message_type, text_content, created_at FROM chat_messages ORDER BY created_at DESC LIMIT 10`;
  console.log('messages:', JSON.stringify(msgs, null, 2));

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});