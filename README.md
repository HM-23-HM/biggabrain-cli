# About

This is a command-line application to generate the educational and marketing content powering [Bigga Brain](https://www.biggabrain.com), a free website I developed to help CSEC math students prepare for their upcoming math exams. 

# Tech stack

TypeScript
Node.js
Gemini API
OpenAI API

# Folder structure

```
src/
├── services/
│   ├── contentService.ts   #Main business logic orchestration
│   ├── editingService.ts   #Text processing and editing functions
│   ├── fileService.ts      #File I/O and generation
│   └── llmService.ts       #AI model interaction
└── utils/
    └── types.ts
templates/
yaml/
```