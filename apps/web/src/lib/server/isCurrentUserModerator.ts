import { createServerFn } from '@tanstack/react-start'

import { getSupabaseServerClient } from '~/lib/utils/supabase/server'

export const isCurrentUserModeratorFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    const supabase = getSupabaseServerClient()

    const { data: isModeratorData, error: moderatorError } = await supabase.rpc(
      'is_current_user_moderator',
    )

    if (moderatorError) {
      throw new Error(`Failed to check user role: ${moderatorError.message}`)
    }

    return Boolean(isModeratorData)
  })
