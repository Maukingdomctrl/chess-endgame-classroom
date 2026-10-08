import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // The built-in courses (courses/*.pgn) are large text files: keep them in a chunk of their own.
        codeSplitting: { groups: [{ name: 'courses', test: /courses\/.*\.pgn/ }] },
      },
    },
  },
})
