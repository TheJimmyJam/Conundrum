import { create } from 'zustand'
import type { QuestionWithOptions } from '../types'

interface Answer {
  question_id: string
  selected_option_id: string
  response_time_ms: number
}

interface GameState {
  sessionId: string | null
  questions: QuestionWithOptions[]
  currentIndex: number
  answers: Answer[]
  startedAt: number | null
  questionStartedAt: number | null

  // Endless mode
  mode: 'daily' | 'endless'
  runningScore: number
  streakCount: number

  setSession: (id: string, mode: 'daily' | 'endless') => void
  setQuestions: (questions: QuestionWithOptions[]) => void
  startQuestion: () => void
  recordAnswer: (questionId: string, optionId: string) => void
  nextQuestion: () => void
  addEndlessQuestion: (question: QuestionWithOptions) => void
  updateRunningScore: (points: number, isCorrect: boolean) => void
  reset: () => void
}

const initialState = {
  sessionId: null,
  questions: [],
  currentIndex: 0,
  answers: [],
  startedAt: null,
  questionStartedAt: null,
  mode: 'daily' as const,
  runningScore: 0,
  streakCount: 0,
}

export const useGameStore = create<GameState>((set, get) => ({
  ...initialState,

  setSession: (id, mode) => set({ sessionId: id, mode, startedAt: Date.now() }),
  setQuestions: (questions) => set({ questions }),

  startQuestion: () => set({ questionStartedAt: Date.now() }),

  recordAnswer: (questionId, optionId) => {
    const { questionStartedAt, answers } = get()
    const responseTimeMs = questionStartedAt ? Date.now() - questionStartedAt : 0
    set({
      answers: [...answers, { question_id: questionId, selected_option_id: optionId, response_time_ms: responseTimeMs }],
    })
  },

  nextQuestion: () => set((s) => ({ currentIndex: s.currentIndex + 1, questionStartedAt: Date.now() })),

  addEndlessQuestion: (question) => set((s) => ({ questions: [...s.questions, question] })),

  updateRunningScore: (points, isCorrect) =>
    set((s) => ({
      runningScore: s.runningScore + points,
      streakCount: isCorrect ? s.streakCount + 1 : 0,
    })),

  reset: () => set(initialState),
}))
