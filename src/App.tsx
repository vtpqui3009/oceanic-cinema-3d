import { Experience } from './scene/Experience'
import { Loader } from './ui/Loader'
import { DiveTrack, Overlay } from './ui/Overlay'
import { DiscoveryCard, Logbook, TopBar, WorldMarkers } from './ui/Explore'
import { GameHUD } from './game/GameHUD'
import { TouchControls } from './game/TouchControls'
import { useExperienceStore } from './state/useExperienceStore'

export default function App() {
  const game = useExperienceStore((s) => s.mode === 'game' && s.started)
  return (
    <>
      <Experience />
      <WorldMarkers />
      <Overlay />
      <TouchControls />
      <GameHUD />
      <TopBar />
      <DiscoveryCard />
      <Logbook />
      {/* explore mode has no scroll: the wheel zooms the lens */}
      {!game && <DiveTrack />}
      <Loader />
    </>
  )
}
