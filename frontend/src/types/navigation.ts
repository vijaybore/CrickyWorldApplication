// src/types/navigation.ts

export type RootStackParamList = {
  Home: undefined

  Login: undefined
  Register: undefined

     WaitingForVerification: { email: string; purpose: 'register' | 'login'; loginToken: string }

   ForgotPassword: undefined

  NewMatch: undefined
  OpenMatch: undefined

  Scoring: { id: string }
  MatchDetails: { id: string }
  MatchReport: { id: string }

  Players: undefined
  ManagePlayers: undefined
  PlayerProfile: { id: string }

  Tournaments: undefined

  Records: undefined
  Settings: undefined
}