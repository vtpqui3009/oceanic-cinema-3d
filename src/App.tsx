import { Experience } from './scene/Experience'
import { Loader } from './ui/Loader'
import { DiveTrack, Overlay } from './ui/Overlay'
import { DiscoveryCard, Logbook, TopBar, WorldMarkers } from './ui/Explore'

export default function App() {
  return (
    <>
      <Experience />
      <WorldMarkers />
      <Overlay />
      <TopBar />
      <DiscoveryCard />
      <Logbook />
      <DiveTrack />
      <Loader />
    </>
  )
}
