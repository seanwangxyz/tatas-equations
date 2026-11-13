# Five-minute device check (iPad and laptop)

The helpers who built the sounds and the 3D speed tuning could measure them but could not hear them or hold an
iPad. This list is the part only you can do. Do it once on the iPad and once on the laptop. Each step says what to
tap, what you should hear or see, and what to send back. Everything you send back is text you paste into a message.

Before you start: iPad volume about half way, no headphones (try headphones at the end), the game open in Safari
(or from the Home Screen icon if you installed it).

## 1. Sound starts (30 seconds)

1. Open the game and tap anywhere on the first screen.
   **You should hear:** the title fanfare with the cubes landing, then soft menu music.
2. **If you hear nothing on the iPad:** check the silent switch or the bell in Control Center (swipe down from the
   top-right corner). When the iPad is on silent, the game is silent too (that is how iPads treat web games).
   You can change that in step 2 ("Play sound even when the iPad is set to silent").
3. **Send back:** "1 OK", or what you heard instead.

## 2. Sound check screen (2 minutes)

Settings → Sound → **Sound check**.

1. Tap **Play the loudest moment**. It is a match win: fanfare, crowd roar, cheering, fireworks, a creature talking,
   a chime, all at once (about 8 seconds).
   **You should hear:** loud and busy, but clean. **Not OK:** crackling, buzzing, distortion, or the sound cutting
   out. If you have to turn the iPad down for it, say so.
2. Tap ▶ on a few sounds in each group (Taps, Effects, Crowd, Voices, Ambience, Music). The order of loudness is
   meant to be: taps quietest, ambience very quiet (just a murmur), music in the background, voices clear, fanfare and
   slam the loudest.
3. Anything that sounds wrong: tap its **flag** (⚑) until it shows the problem (too loud, too quiet, harsh, clicks,
   did not play, plays late). The report is copied each time.
4. Move the five sliders (Music, Effects, Crowd, Voices, Ambience) until the game sounds right for your son. They are
   saved.
5. Tap **Copy report** and paste it into your message.
6. **Send back:** the pasted report (it includes your flags, your slider settings and the iPad model string).

## 3. Interruptions on the iPad (1 minute)

1. Start a match (any creature). While the music plays, press the Home button / swipe up to the Home Screen, wait
   5 seconds, come back to Safari.
   **You should hear:** the music and the stadium murmur again within a second or two. Tap the screen once if not.
2. Lock the iPad with the top button, unlock it, come back. Same check.
3. If you can, have someone call you (or start a FaceTime) during a match, hang up, come back. Same check.
4. With "Read lines aloud" on (Settings), switch away while a line is being read: it should stop cleanly, not
   continue garbled when you return.
5. **Send back:** "3 OK", or which of the four did not come back (and whether one tap fixed it).

## 4. Speed (1 minute)

1. Open the game with `?perf=1` at the end of the address (for example `https://…/index.html?perf=1`), or turn on
   the "Speed overlay" switch in the Parent corner if it is there. A small dark box appears in the top-right corner.
2. Start a match (a stadium one if you can). When the table is showing, tap **Run 20-second benchmark** in the box
   and do not touch the iPad for 20 seconds (it plays cheering, fireworks, rain and dancing creatures on purpose).
   **You should see:** a sentence at the bottom of the box, like "Smooth enough. Keep 3D picture quality on Auto."
3. Tap **Copy report** in the box and paste it into your message. Then tap **Hide**.
4. Play for a minute. Does it feel smooth? Do the cubes ever stutter when they pour?
5. **Send back:** the speed report, plus "feels smooth / jerky when …".

## 5. Headphones and the laptop (30 seconds)

1. Plug in headphones (or AirPods) on the iPad and tap **Play the loudest moment** again. Nothing should be harsh or
   piercing in the ears; the claps and fireworks crackle should be soft.
2. On the laptop: do steps 2.1, 2.5 and 4 (the benchmark and its report).
3. **Send back:** "5 OK", or what was harsh.

## What the developer can and cannot know without you

Measured by the helpers (offline, no speakers): every sound's loudness, peak, brightness, clicks and the worst
pile-ups (docs/handoff/sound.md); the automatic quality steps under a simulated slow device; memory after many
matches. Not measured (needs you): how it actually sounds on iPad speakers and headphones, whether the silent switch,
lock screen and phone calls behave, how the device voices sound, and the real frame rate on your iPad.
