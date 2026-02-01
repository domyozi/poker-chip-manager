{\rtf1\ansi\ansicpg932\cocoartf2867
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 # Poker Chip Manager \'96 Requirements\
\
## Product Goal\
- Real-card Texas Hold\'92em chip management app\
- Must never block gameplay\
- Must work reliably on mobile\
\
## Global Rules\
- Investigation before fixes\
- No guessing: root cause must be identified\
- P0 issues take priority over visuals\
- P2 (card visuals) are explicitly deferred\
\
## Priorities\
P0:\
- Showdown must never freeze the app\
- Room code input must work on mobile\
\
P1:\
- App version must be visible on screen\
\
P2 (Deferred):\
- Card visual improvements\
\
## Mandatory UX Rules\
- Game must always have a way to continue\
- Host-only actions must be explicit\
- Non-host clients must never appear frozen\
\
## Debug Policy\
- If root cause is unclear, runtime instrumentation is required\
- Debug UI must be behind a flag (?debug=1)\
\
## Technical Constraints\
- index.html \uc0\u51473 \u49900 \
- No new frameworks\
- Supabase config untouched\

## Delivery Rule\
- Every change must be committed and pushed to git before completion\
}
