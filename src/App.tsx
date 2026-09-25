import { Experience } from './scene/Experience'
import { Loader } from './ui/Loader'
import { DiveTrack, Overlay } from './ui/Overlay'

export default function App() {
  return (
    <>
      <Experience />
      <Overlay />
      <DiveTrack />
      <Loader />
    </>
  )
}
