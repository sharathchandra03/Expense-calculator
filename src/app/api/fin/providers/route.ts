import { listProviders } from '@/lib/fin/providers/registry'
import { getRequestUser, json } from '@/lib/fin/server/http'
import { fail } from '@/lib/fin/server/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const user = await getRequestUser(req)
  if (!user) return fail(401, 'unauthenticated', 'Please sign in to connect financial accounts.')
  return json({ providers: listProviders(), sandboxOnly: user.sandboxOnly })
}
