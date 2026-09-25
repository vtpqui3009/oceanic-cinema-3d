import { Experience } from './scene/Experience'
import { Loader } from './ui/Loader'
import { Hud } from './ui/Hud'

export default function App() {
  return (
    <main className="app">
      <Experience />
      <Hud />
      <Loader />
    </main>
  )
}
