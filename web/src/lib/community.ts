export const COMMUNITY_GROUP = 'google-tester-indonesia@googlegroups.com'
/** Email-list testing unlocks once the creator is testing this many other apps (Testing count; migration 20261104000200). */
export const EMAIL_LIST_MIN_TESTING = 3

/** Direct group page (no account picker). Prefer {@link COMMUNITY_GROUP_URL} for join CTAs. */
export const COMMUNITY_GROUP_PAGE = 'https://groups.google.com/g/google-tester-indonesia'

/**
 * Join CTA: Google AccountChooser first, then the group page.
 * Multi-account browsers that open the group with the wrong account, then switch,
 * land on "Grup saya" and lose the Join button — picking the account up front avoids that.
 */
export const COMMUNITY_GROUP_URL =
  `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(COMMUNITY_GROUP_PAGE)}`

export const WHATSAPP_URL = 'https://chat.whatsapp.com/DGV6U43cbG10QWGJVO3bcY?mode=gi_t'
