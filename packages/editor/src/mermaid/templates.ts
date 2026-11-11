/** Starting points offered in the editor dialog. */
export const MERMAID_TEMPLATES: { label: string, source: string }[] = [
  {
    label: '流程圖',
    source: 'flowchart TD\n  A[開始] --> B{判斷}\n  B -->|是| C[動作 1]\n  B -->|否| D[動作 2]\n  C --> E[結束]\n  D --> E',
  },
  {
    label: '序列圖',
    source: 'sequenceDiagram\n  participant C as Client\n  participant S as Server\n  C->>S: Request\n  S-->>C: Response',
  },
  {
    label: '類別圖',
    source: 'classDiagram\n  class Animal {\n    +String name\n    +speak()\n  }\n  class Dog {\n    +fetch()\n  }\n  Animal <|-- Dog',
  },
  {
    label: '狀態圖',
    source: 'stateDiagram-v2\n  [*] --> Idle\n  Idle --> Working: start\n  Working --> Done: finish\n  Working --> Idle: cancel\n  Done --> [*]',
  },
  {
    label: '甘特圖',
    source: 'gantt\n  dateFormat YYYY-MM-DD\n  section 規劃\n    需求 :a1, 2026-11-01, 5d\n    設計 :a2, after a1, 7d\n  section 開發\n    實作 :after a2, 14d',
  },
  {
    label: '圓餅圖',
    source: 'pie title 時間分配\n  "開發" : 55\n  "會議" : 25\n  "文件" : 20',
  },
]
