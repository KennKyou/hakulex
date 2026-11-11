import type { SerializedEditorState } from 'lexical'

/*
 * Documents the tests read. `everyNode` holds every kind of node the editor knows, plus stored
 * Excalidraw and the old `code` node, each with a block id and its optional fields: the custom
 * nodes are the document the LiteXML tests use, the Lexical ones come from Lexical
 * itself. Three things are as the hakulex editor saves them, so that it gives the document back
 * unchanged too: tags and comments carry the text fields, spoilers and ruby don't carry
 * `textFormat`, and the file on a line of its own is a block one.
 */

export type Json = Record<string, any>

export const everyNode: SerializedEditorState & Json = {
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: '標題 ',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 1,
            mode: 'normal',
            style: '',
            text: '粗',
            type: 'text',
            version: 1,
          },
        ],
        tag: 'h2',
        direction: null,
        format: '',
        indent: 0,
        type: 'heading',
        version: 1,
        $: {
          blockId: 'b01',
        },
      },
      {
        children: [
          {
            detail: 0,
            format: 1,
            mode: 'normal',
            style: '',
            text: '粗體',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' ',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 2,
            mode: 'normal',
            style: '',
            text: '斜體',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' ',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 4,
            mode: 'normal',
            style: '',
            text: '刪除',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' ',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 16,
            mode: 'normal',
            style: '',
            text: 'code',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' ',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 8,
            mode: 'normal',
            style: '',
            text: '底線',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' ',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 64,
            mode: 'normal',
            style: '',
            text: '上',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' ',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 32,
            mode: 'normal',
            style: '',
            text: '下',
            type: 'text',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' ',
            type: 'text',
            version: 1,
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: '連結',
                type: 'text',
                version: 1,
              },
            ],
            rel: null,
            target: null,
            title: 'A',
            url: 'https://x.test/a',
            direction: null,
            format: '',
            indent: 0,
            type: 'link',
            version: 1,
            $: {
              blockId: 'b03',
            },
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: ' ',
            type: 'text',
            version: 1,
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: 'https://x.test/b',
                type: 'text',
                version: 1,
              },
            ],
            isUnlinked: false,
            rel: null,
            target: null,
            title: null,
            url: 'https://x.test/b',
            direction: null,
            format: '',
            indent: 0,
            type: 'autolink',
            version: 1,
            $: {
              blockId: 'b04',
            },
          },
          {
            type: 'linebreak',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: '第二行',
            type: 'text',
            version: 1,
          },
          {
            detail: 2,
            mode: 'normal',
            text: '\t',
            format: 0,
            style: '',
            type: 'tab',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'tab',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        textFormat: 1,
        textStyle: '',
        type: 'paragraph',
        version: 1,
        $: {
          blockId: 'b02',
        },
      },
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: '引用',
            type: 'text',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'quote',
        version: 1,
        $: {
          blockId: 'b05',
        },
      },
      {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: '項目一',
                type: 'text',
                version: 1,
              },
            ],
            indent: 0,
            value: 1,
            direction: null,
            format: '',
            type: 'listitem',
            version: 1,
          },
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: '子項',
                        type: 'text',
                        version: 1,
                      },
                    ],
                    indent: 1,
                    value: 1,
                    direction: null,
                    format: '',
                    type: 'listitem',
                    version: 1,
                  },
                ],
                listType: 'bullet',
                start: 1,
                tag: 'ul',
                direction: null,
                format: '',
                indent: 0,
                type: 'list',
                version: 1,
              },
            ],
            indent: 0,
            value: 2,
            direction: null,
            format: '',
            type: 'listitem',
            version: 1,
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: '項目二',
                type: 'text',
                version: 1,
              },
            ],
            indent: 0,
            value: 2,
            direction: null,
            format: '',
            type: 'listitem',
            version: 1,
          },
        ],
        listType: 'bullet',
        start: 1,
        tag: 'ul',
        direction: null,
        format: '',
        indent: 0,
        type: 'list',
        version: 1,
        $: {
          blockId: 'b06',
        },
      },
      {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: '第三',
                type: 'text',
                version: 1,
              },
            ],
            indent: 0,
            value: 3,
            direction: null,
            format: '',
            type: 'listitem',
            version: 1,
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: '第四',
                type: 'text',
                version: 1,
              },
            ],
            indent: 0,
            value: 4,
            direction: null,
            format: '',
            type: 'listitem',
            version: 1,
          },
        ],
        listType: 'number',
        start: 3,
        tag: 'ol',
        direction: null,
        format: '',
        indent: 0,
        type: 'list',
        version: 1,
        $: {
          blockId: 'b07',
        },
      },
      {
        children: [
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: '完成',
                type: 'text',
                version: 1,
              },
            ],
            checked: true,
            indent: 0,
            value: 1,
            direction: null,
            format: '',
            type: 'listitem',
            version: 1,
          },
          {
            children: [
              {
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                text: '未完成',
                type: 'text',
                version: 1,
              },
            ],
            checked: false,
            indent: 0,
            value: 2,
            direction: null,
            format: '',
            type: 'listitem',
            version: 1,
          },
        ],
        listType: 'check',
        start: 1,
        tag: 'ul',
        direction: null,
        format: '',
        indent: 0,
        type: 'list',
        version: 1,
        $: {
          blockId: 'b08',
        },
      },
      {
        children: [
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: '名稱',
                        type: 'text',
                        version: 1,
                      },
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    textFormat: 0,
                    textStyle: '',
                    type: 'paragraph',
                    version: 1,
                  },
                ],
                backgroundColor: null,
                colSpan: 1,
                headerState: 1,
                rowSpan: 1,
                direction: null,
                format: '',
                indent: 0,
                type: 'tablecell',
                version: 1,
              },
              {
                children: [
                  {
                    children: [
                      {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: '說明',
                        type: 'text',
                        version: 1,
                      },
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    textFormat: 0,
                    textStyle: '',
                    type: 'paragraph',
                    version: 1,
                  },
                ],
                backgroundColor: null,
                colSpan: 1,
                headerState: 1,
                rowSpan: 1,
                direction: null,
                format: '',
                indent: 0,
                type: 'tablecell',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'tablerow',
            version: 1,
          },
          {
            children: [
              {
                children: [
                  {
                    children: [
                      {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: 'a|b',
                        type: 'text',
                        version: 1,
                      },
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    textFormat: 0,
                    textStyle: '',
                    type: 'paragraph',
                    version: 1,
                  },
                ],
                backgroundColor: null,
                colSpan: 1,
                headerState: 0,
                rowSpan: 1,
                direction: null,
                format: '',
                indent: 0,
                type: 'tablecell',
                version: 1,
              },
              {
                children: [
                  {
                    children: [
                      {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: '一',
                        type: 'text',
                        version: 1,
                      },
                      {
                        type: 'linebreak',
                        version: 1,
                      },
                      {
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        text: '二',
                        type: 'text',
                        version: 1,
                      },
                    ],
                    direction: null,
                    format: '',
                    indent: 0,
                    textFormat: 0,
                    textStyle: '',
                    type: 'paragraph',
                    version: 1,
                  },
                ],
                backgroundColor: null,
                colSpan: 1,
                headerState: 0,
                rowSpan: 1,
                direction: null,
                format: '',
                indent: 0,
                type: 'tablecell',
                version: 1,
              },
            ],
            direction: null,
            format: '',
            indent: 0,
            type: 'tablerow',
            version: 1,
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'table',
        version: 1,
        $: {
          blockId: 'b09',
        },
      },
      {
        type: 'horizontalrule',
        version: 1,
        $: {
          blockId: 'b10',
        },
      },
      {
        type: 'image',
        src: 'https://x.test/a.png',
        altText: '圖',
        width: 800,
        height: 600,
        caption: '說明',
        thumbhash: 'abc',
        accent: '#112233',
        displayWidth: 60,
        layout: 'float-left',
        version: 1,
        $: {
          blockId: 'b11',
        },
      },
      {
        type: 'video',
        src: 'https://x.test/v.mp4',
        poster: 'https://x.test/p.jpg',
        version: 1,
        $: {
          blockId: 'b12',
        },
      },
      {
        type: 'file',
        src: 'https://x.test/f.pdf',
        name: '報告.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        ext: 'pdf',
        display: 'block',
        version: 1,
        $: {
          blockId: 'b13',
        },
      },
      {
        type: 'link-card',
        url: 'https://github.com/a/b',
        source: 'github',
        title: 'a/b',
        description: 'desc',
        favicon: 'https://x.test/f.ico',
        image: 'https://x.test/i.png',
        version: 1,
        $: {
          blockId: 'b14',
        },
      },
      {
        type: 'embed',
        url: 'https://www.youtube.com/watch?v=x',
        source: 'youtube',
        version: 1,
        $: {
          blockId: 'b15',
        },
      },
      {
        type: 'code-block',
        code: 'const a = 1 < 2 && b\n# not md',
        language: 'ts',
        version: 1,
        $: {
          blockId: 'b16',
        },
      },
      {
        type: 'mermaid',
        diagram: 'graph TD\n  A-->B',
        version: 1,
        $: {
          blockId: 'b17',
        },
      },
      {
        type: 'katex-block',
        equation: '\\int_0^1 x\\,dx',
        version: 1,
        $: {
          blockId: 'b18',
        },
      },
      {
        type: 'paragraph',
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        textFormat: 0,
        textStyle: '',
        children: [
          {
            type: 'text',
            text: 'x ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'katex-inline',
            equation: 'a^2',
            color: '#ff0000',
            version: 1,
            $: {
              blockId: 'b20',
            },
          },
          {
            type: 'text',
            text: ' ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            type: 'mention',
            platform: 'GH',
            handle: 'octocat',
            displayName: 'Octocat',
            version: 1,
            $: {
              blockId: 'b21',
            },
          },
          {
            type: 'text',
            text: ' ',
            format: 0,
            detail: 0,
            mode: 'normal',
            style: '',
            version: 1,
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            type: 'tag',
            text: '標籤',
            version: 1,
            $: {
              blockId: 'b22',
            },
          },
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            type: 'comment',
            text: '註解',
            version: 1,
            $: {
              blockId: 'b23',
            },
          },
          {
            type: 'spoiler',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: '雷',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
            $: {
              blockId: 'b24',
            },
          },
          {
            type: 'ruby',
            reading: 'かん',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'text',
                text: '漢',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
            $: {
              blockId: 'b25',
            },
          },
          {
            type: 'footnote',
            identifier: '1',
            version: 1,
            $: {
              blockId: 'b26',
            },
          },
        ],
        $: {
          blockId: 'b19',
        },
      },
      {
        type: 'alert-quote',
        alertType: 'warning',
        content: {
          root: {
            type: 'root',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'paragraph',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                textFormat: 0,
                textStyle: '',
                children: [
                  {
                    type: 'text',
                    text: '小心',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
        version: 1,
        $: {
          blockId: 'b27',
        },
      },
      {
        type: 'banner',
        bannerType: 'tip',
        content: {
          root: {
            type: 'root',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'paragraph',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                textFormat: 0,
                textStyle: '',
                children: [
                  {
                    type: 'text',
                    text: '提示',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
        version: 1,
        $: {
          blockId: 'b28',
        },
      },
      {
        type: 'details',
        summary: '更多',
        open: true,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            textStyle: '',
            children: [
              {
                type: 'text',
                text: '內容',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
        ],
        $: {
          blockId: 'b29',
        },
      },
      {
        type: 'nested-doc',
        content: {
          root: {
            type: 'root',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            children: [
              {
                type: 'paragraph',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                textFormat: 0,
                textStyle: '',
                children: [
                  {
                    type: 'text',
                    text: '巢狀',
                    format: 0,
                    detail: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                  },
                ],
              },
            ],
          },
        },
        version: 1,
        $: {
          blockId: 'b30',
        },
      },
      {
        type: 'grid-container',
        cols: 2,
        gap: '16px',
        cells: [
          {
            root: {
              type: 'root',
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
              children: [
                {
                  type: 'paragraph',
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  version: 1,
                  textFormat: 0,
                  textStyle: '',
                  children: [
                    {
                      type: 'text',
                      text: '左',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                      version: 1,
                    },
                  ],
                },
              ],
            },
          },
          {
            root: {
              type: 'root',
              direction: 'ltr',
              format: '',
              indent: 0,
              version: 1,
              children: [
                {
                  type: 'paragraph',
                  direction: 'ltr',
                  format: '',
                  indent: 0,
                  version: 1,
                  textFormat: 0,
                  textStyle: '',
                  children: [
                    {
                      type: 'text',
                      text: '右',
                      format: 0,
                      detail: 0,
                      mode: 'normal',
                      style: '',
                      version: 1,
                    },
                  ],
                },
              ],
            },
          },
        ],
        version: 1,
        $: {
          blockId: 'b31',
        },
      },
      {
        type: 'steps',
        steps: [
          {
            id: 's_one',
            title: '第一步',
            content: {
              root: {
                type: 'root',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                children: [
                  {
                    type: 'paragraph',
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    version: 1,
                    textFormat: 0,
                    textStyle: '',
                    children: [
                      {
                        type: 'text',
                        text: '做這個',
                        format: 0,
                        detail: 0,
                        mode: 'normal',
                        style: '',
                        version: 1,
                      },
                    ],
                  },
                ],
              },
            },
          },
          {
            id: 's_two',
            title: '第二步',
            content: {
              root: {
                type: 'root',
                direction: 'ltr',
                format: '',
                indent: 0,
                version: 1,
                children: [
                  {
                    type: 'paragraph',
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    version: 1,
                    textFormat: 0,
                    textStyle: '',
                    children: [
                      {
                        type: 'text',
                        text: '再做那個',
                        format: 0,
                        detail: 0,
                        mode: 'normal',
                        style: '',
                        version: 1,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
        version: 1,
        $: {
          blockId: 'b32',
        },
      },
      {
        type: 'gallery',
        images: [
          {
            src: 'https://x.test/1.png',
            alt: '一',
            width: 100,
            height: 80,
          },
          {
            src: 'https://x.test/2.png',
            alt: '二',
          },
        ],
        layout: 'grid',
        aspect: '4:3',
        fit: 'contain',
        maxItemHeight: 320,
        version: 1,
        $: {
          blockId: 'b33',
        },
      },
      {
        type: 'code-snippet',
        files: [
          {
            filename: 'a.ts',
            language: 'ts',
            code: 'export const a = 1',
          },
          {
            filename: 'b.css',
            language: 'css',
            code: 'a { color: red }',
          },
        ],
        version: 1,
        $: {
          blockId: 'b34',
        },
      },
      {
        type: 'chart',
        spec: '{"type":"bar","data":[1,2]}\n<&>',
        version: 1,
        $: {
          blockId: 'b35',
        },
      },
      {
        type: 'chat',
        variant: 'user-agent',
        participants: [
          {
            id: 'p_u',
            kind: 'user',
            name: '我',
            avatar: 'https://x.test/u.png',
          },
          {
            id: 'p_a',
            kind: 'agent',
            name: '助理',
          },
        ],
        messages: [
          {
            id: 'm_1',
            participantId: 'p_u',
            content: '你好',
          },
          {
            id: 'm_2',
            participantId: 'p_a',
            content: '**哈囉**',
          },
        ],
        version: 1,
        $: {
          blockId: 'b36',
        },
      },
      {
        type: 'poll',
        pollId: 'p_poll1',
        question: '哪個？',
        options: [
          {
            id: 'o_a',
            label: 'A',
          },
          {
            id: 'o_b',
            label: 'B',
          },
        ],
        mode: 'multiple',
        closeAt: '2026-12-01',
        showResults: 'after-vote',
        version: 1,
        $: {
          blockId: 'b37',
        },
      },
      {
        type: 'dynamic',
        url: 'https://x.test/widget.js',
        initialHeight: 240,
        props: {
          a: 1,
          b: '<x>',
        },
        version: 1,
        $: {
          blockId: 'b38',
        },
      },
      {
        type: 'footnote-section',
        definitions: {
          1: '註腳內容',
        },
        version: 1,
        $: {
          blockId: 'b39',
        },
      },
      {
        type: 'excalidraw',
        snapshot: '{"elements":[]}',
        version: 1,
        $: {
          blockId: 'b40',
        },
      },
      {
        type: 'rich-quote',
        attribution: null,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
        children: [
          {
            type: 'paragraph',
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textFormat: 0,
            textStyle: '',
            children: [
              {
                type: 'text',
                text: '無出處',
                format: 0,
                detail: 0,
                mode: 'normal',
                style: '',
                version: 1,
              },
            ],
          },
        ],
        $: {
          blockId: 'b41',
        },
      },
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: 'const x = 1',
            type: 'text',
            version: 1,
          },
        ],
        language: 'js',
        direction: null,
        format: '',
        indent: 0,
        type: 'code',
        version: 1,
        $: {
          blockId: 'b42',
        },
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
}

/** Kinds the hakulex editor keeps as unknown nodes, so it can't be compared with it. */
export const onlyInHeadless = ['excalidraw', 'code']

export function doc(...children: Json[]): SerializedEditorState & Json {
  return {
    root: {
      children,
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  } as SerializedEditorState & Json
}

export function text(value: string, format = 0): Json {
  return {
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text: value,
    type: 'text',
    version: 1,
  }
}

export function paragraph(...children: Json[]): Json {
  return {
    children,
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    type: 'paragraph',
    version: 1,
  }
}

// ── Documents for Markdown ──

const BOLD = 1
const ITALIC = 2
const STRIKE = 4
const UNDERLINE = 8
const CODE = 16
const SUBSCRIPT = 32
const SUPERSCRIPT = 64

const element = {
  direction: null,
  format: '',
  indent: 0,
  version: 1,
}

function heading(tag: string, ...children: Json[]): Json {
  return {
    ...element,
    type: 'heading',
    tag,
    children,
  }
}

function list(listType: 'bullet' | 'number' | 'check', items: Json[][], checked: boolean[] = []): Json {
  return {
    ...element,
    type: 'list',
    listType,
    start: 1,
    tag: listType === 'number'
      ? 'ol'
      : 'ul',
    children: items.map((children, index) => ({
      ...element,
      type: 'listitem',
      value: index + 1,
      ...(listType === 'check'
        ? { checked: checked[index] ?? false }
        : {}),
      children,
    })),
  }
}

function cell(header: boolean, ...children: Json[]): Json {
  return {
    ...element,
    type: 'tablecell',
    colSpan: 1,
    rowSpan: 1,
    headerState: header ? 1 : 0,
    backgroundColor: null,
    children: [
      paragraph(...children),
    ],
  }
}

const linebreak = { type: 'linebreak', version: 1 }

/** Text formats, the inline nodes, and Lexical's blocks. */
export const inlineMarkdown = doc(
  heading('h2', text('標題')),
  paragraph(
    text('粗', BOLD),
    text(' '),
    text('斜', ITALIC),
    text(' '),
    text('刪', STRIKE),
    text(' '),
    text('code', CODE),
    text(' '),
    text('底', UNDERLINE),
    text(' x'),
    text('2', SUPERSCRIPT),
    text(' H'),
    text('2', SUBSCRIPT),
    text('O '),
    {
      ...element,
      type: 'link',
      url: 'https://x.test/a',
      rel: null,
      target: null,
      title: null,
      children: [
        text('連結'),
      ],
    },
  ),
  paragraph(
    {
      ...element,
      type: 'spoiler',
      children: [
        text('雷'),
      ],
    },
    text(' '),
    {
      ...element,
      type: 'ruby',
      reading: 'かん',
      children: [
        text('漢'),
      ],
    },
    text(' '),
    {
      ...element,
      type: 'ruby',
      reading: '',
      children: [
        text('字'),
      ],
    },
    text(' '),
    { type: 'katex-inline', version: 1, equation: 'a^2' },
    text(' '),
    {
      type: 'mention',
      version: 1,
      platform: 'GH',
      handle: 'octocat',
      displayName: 'Octocat',
    },
    text(' '),
    {
      type: 'mention',
      version: 1,
      platform: 'X',
      handle: 'a.b-c',
    },
    text(' '),
    { type: 'footnote', version: 1, identifier: '1' },
    text(' '),
    {
      type: 'tag',
      version: 1,
      text: '標籤',
      detail: 0,
      format: 0,
      mode: 'normal',
      style: '',
    },
    text(' '),
    {
      type: 'comment',
      version: 1,
      text: '註解',
      detail: 0,
      format: 0,
      mode: 'normal',
      style: '',
    },
  ),
  list('bullet', [
    [
      text('一'),
    ],
    [
      text('二'),
    ],
  ]),
  list('number', [
    [
      text('甲'),
    ],
    [
      text('乙'),
    ],
  ]),
  list('check', [
    [
      text('完成'),
    ],
    [
      text('未完'),
    ],
  ], [true, false]),
  {
    ...element,
    type: 'quote',
    children: [
      text('引用'),
    ],
  },
  {
    ...element,
    type: 'rich-quote',
    attribution: '魯迅',
    children: [
      paragraph(text('有出處')),
    ],
  },
)

/** Blocks that hold data. */
export const blockMarkdown = doc(
  {
    type: 'image',
    version: 1,
    src: 'https://x.test/a.png',
    altText: '圖',
    caption: '說 "明"',
  },
  {
    type: 'image',
    version: 1,
    src: 'https://x.test/b.png',
    altText: '',
  },
  {
    type: 'video',
    version: 1,
    src: 'https://x.test/v.mp4',
    poster: 'https://x.test/p.jpg',
    width: 640,
    height: 360,
  },
  {
    type: 'file',
    version: 1,
    src: 'https://x.test/f.pdf',
    name: 'f.pdf',
  },
  {
    type: 'code-block',
    version: 1,
    code: 'a\n```\nb',
    language: 'md',
  },
  {
    ...element,
    type: 'code',
    language: 'js',
    children: [
      text('const x = 1'),
    ],
  },
  { type: 'mermaid', version: 1, diagram: 'graph TD\n  A-->B' },
  { type: 'chart', version: 1, spec: '{"type":"bar"}' },
  { type: 'katex-block', version: 1, equation: '\\int_0^1 x' },
  {
    type: 'link-card',
    version: 1,
    url: 'https://x.test/c',
    title: '卡片',
  },
  { type: 'link-card', version: 1, url: 'https://x.test/d' },
  {
    type: 'embed',
    version: 1,
    url: 'https://www.youtube.com/watch?v=x',
    source: 'youtube',
  },
  { type: 'horizontalrule', version: 1 },
  {
    ...element,
    type: 'table',
    children: [
      {
        ...element,
        type: 'tablerow',
        children: [
          cell(true, text('名稱')),
          cell(true, text('說明')),
        ],
      },
      {
        ...element,
        type: 'tablerow',
        children: [
          cell(false, text('a|b')),
          cell(false, text('一'), linebreak, text('二')),
        ],
      },
    ],
  },
  {
    type: 'gallery',
    version: 1,
    images: [
      { src: 'https://x.test/1.png', alt: '一' },
      { src: 'https://x.test/2.png' },
    ],
  },
  {
    type: 'code-snippet',
    version: 1,
    files: [
      { filename: 'a.ts', language: 'ts', code: 'const a = 1' },
      { filename: '', language: '', code: '```' },
    ],
  },
  {
    type: 'poll',
    version: 1,
    pollId: 'p_1',
    question: '哪個 <好>？',
    mode: 'multiple',
    closeAt: '2026-12-01',
    showResults: 'after-vote',
    options: [
      { id: 'o_a', label: 'A & B' },
      { id: 'o_b', label: 'C' },
    ],
  },
  { type: 'excalidraw', version: 1, snapshot: '{"elements":[]}' },
  {
    type: 'footnote-section',
    version: 1,
    definitions: { 1: '註腳一', note: '另一個' },
  },
)

const nested = (...children: Json[]) => doc(...children)

/** Blocks holding documents of their own, and chats. */
export const containerMarkdown = doc(
  {
    type: 'alert-quote',
    version: 1,
    alertType: 'warning',
    content: nested(paragraph(text('小心', BOLD)), paragraph(text('第二行'))),
  },
  {
    type: 'banner',
    version: 1,
    bannerType: 'tip',
    content: nested(paragraph(text('提示'))),
  },
  {
    ...element,
    type: 'details',
    summary: '更 "多"',
    open: true,
    children: [
      paragraph(text('內容')),
    ],
  },
  {
    type: 'nested-doc',
    version: 1,
    content: nested(paragraph(text('巢狀')), paragraph(text('兩段'))),
  },
  {
    type: 'grid-container',
    version: 1,
    cols: 3,
    gap: 8,
    cells: [
      nested(paragraph(text('左'))),
      nested(paragraph(text('右'))),
    ],
  },
  {
    type: 'steps',
    version: 1,
    steps: [
      {
        id: 's_a',
        title: '安裝 "它"',
        content: nested(paragraph(text('下載'))),
      },
      {
        id: 's_b',
        title: '設定',
        content: nested(paragraph(text('加金鑰'))),
      },
    ],
  },
  {
    type: 'chat',
    version: 1,
    variant: 'user-agent',
    participants: [
      { id: 'p_u', kind: 'user', name: '我' },
      { id: 'p_a', kind: 'agent' },
    ],
    messages: [
      { id: 'm_1', participantId: 'p_u', content: '問題\n第二行' },
      { id: 'm_2', participantId: 'p_a', content: '**回答**' },
      { id: 'm_3', participantId: 'p_gone', content: '誰？' },
    ],
  },
  {
    type: 'chat',
    version: 1,
    variant: 'user-user',
    participants: [
      { id: 'p_a', kind: 'user', name: 'Alice' },
      { id: 'p_b', kind: 'user' },
    ],
    messages: [
      { id: 'm_1', participantId: 'p_a', content: 'Hi' },
      { id: 'm_2', participantId: 'p_b', content: 'Hello' },
    ],
  },
)

/** A poll and a chat without the fields filled in by default. */
export const defaultsMarkdown = doc(
  {
    type: 'poll',
    version: 1,
    pollId: 'p_2',
    question: '要嗎？',
    options: [
      { id: 'o_y', label: '要' },
    ],
  },
  {
    type: 'chat',
    version: 1,
    participants: [
      { id: 'p_u', kind: 'user', name: '我' },
    ],
    messages: [
      { id: 'm_1', participantId: 'p_u', content: '嗨' },
    ],
  },
)
