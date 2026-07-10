# Sue's Training Tracker

A standalone strength and conditioning tracker, no login needed, works offline once installed, all data stays on the phone it's used on.

## What's different from James's version

- Three sessions rather than fixed weekdays: Lower Power, Upper Strength, and an optional Engine Room day, since training is 2-3 times a week flexibly rather than a fixed schedule.
- Exercise selection is deliberately chosen around protecting knees and lower back: goblet squats instead of back squats, hip thinges taught properly, no loaded spinal flexion for core work.
- Four baseline lifts tracked (DB Bench, DB Squat, Romanian Deadlift, Lat Pulldown) rather than two.
- Purple, blue and orange colour scheme.
- Nutrition tab is framed around general balanced eating for strength and fitness, not a calorie-restricted weight loss goal.
- SkiErg, Row, and Bike all included as conditioning finishers.

## Getting it live

Same process as before:

1. Create free accounts at https://github.com/signup and https://vercel.com/signup (sign into Vercel with GitHub)
2. Create a new empty repository: https://github.com/new
3. Unzip this folder and drag its **contents** (not the folder itself) into the GitHub upload page, package.json, src, public, everything at the top level of the repo
4. Go to https://vercel.com/new, import the repository, leave every setting on default, click Deploy
5. Once live, open the URL in Safari, tap Share, then Add to Home Screen

## A note on getting her set up

Since her data lives on her own phone rather than a shared account, she'll want her own GitHub and Vercel accounts, kept separate from yours. Worth walking her through the deploy steps once, or doing it together, then it's hers to run from that point on.

## Making changes later

Come back to Claude, describe what needs changing, and ask for the updated `App.jsx`. Replace the file in her GitHub repository the same way, Vercel redeploys automatically within a minute or two.
