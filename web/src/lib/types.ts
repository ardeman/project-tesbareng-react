// Client shapes. Database rows are snake_case; mapping happens once in data.ts.
// All instants are epoch milliseconds.

export type AppStatus = 'recruiting' | 'testing' | 'applied' | 'live'
export type TesterStatus = 'active' | 'left' | 'removed'

export interface AppDoc {
  id: string
  name: string
  description: string
  optInUrl: string
  storeUrl?: string | null
  packageName?: string | null
  creatorUid: string
  creatorName: string
  creatorPhotoURL?: string | null
  status: AppStatus
  /** local midnight of the start date */
  testStartDate?: number | null
  feedbackGuide?: string | null
  // computed by the app_stats view
  activeTesterCount: number
  eligibleCount: number
  feedbackSentCount: number
  feedbackVerifiedCount: number
  repliedCount: number
  buildCount: number
  lastBuildAt?: number | null
  creatorTestingCount?: number
  creatorFeedbackSentCount?: number
  creatorFeedbackVerifiedCount?: number
  createdAt: number
  updatedAt?: number
  deleted: boolean
}

export interface TesterDoc {
  id: string
  appId: string
  uid?: string | null
  displayName: string
  photoURL?: string | null
  maskedEmail: string
  optedInAt: number
  leftAt?: number | null
  status: TesterStatus
  addedBy: 'self' | 'creator'
  note?: string | null
  feedbackSent: boolean
  feedbackSentAt?: number | null
  feedbackSummary?: string | null
  feedbackVerified: boolean
  replied: boolean
}

export interface BuildDoc {
  id: string
  versionName: string
  uploadedAt: number
  changelog: string
}

export interface PublicProfile {
  id: string
  displayName: string
  photoURL?: string | null
  maskedEmail: string
  // computed by the profile_stats view
  appsCreatedCount: number
  testingCount: number
  feedbackSentCount: number
  feedbackVerifiedCount: number
  createdAt?: number
}

/** The signed-in member. `email` comes from their own session, never from a table. */
export interface AppUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
}

export interface UserDoc {
  email: string | null
  displayName: string
  photoURL?: string | null
  role: 'member' | 'admin'
}
