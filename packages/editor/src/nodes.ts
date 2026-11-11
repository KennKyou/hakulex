import type { Klass, LexicalNode, LexicalNodeReplacement } from 'lexical'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { ListItemNode, ListNode } from '@lexical/list'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { AlertNode, BannerNode, DetailsNode } from './nodes/CalloutNodes'
import { ChartNode } from './nodes/ChartNode'
import { ChatNode } from './nodes/ChatNode'
import { CodeBlockNode } from './nodes/CodeBlockNode'
import { CodeSnippetNode } from './nodes/CodeSnippetNode'
import { CommentNode } from './nodes/CommentNode'
import { DynamicNode } from './nodes/DynamicNode'
import { EmbedNode } from './nodes/EmbedNode'
import { FootnoteNode, FootnoteSectionNode } from './nodes/FootnoteNodes'
import { GalleryNode } from './nodes/GalleryNode'
import { GridNode } from './nodes/GridNode'
import { HorizontalRuleNode } from './nodes/HorizontalRuleNode'
import { ImageNode } from './nodes/ImageNode'
import { RubyNode, SpoilerNode } from './nodes/InlineNodes'
import { LinkCardNode } from './nodes/LinkCardNode'
import { KaTeXBlockNode, KaTeXInlineNode } from './nodes/MathNodes'
import { FileNode, VideoNode } from './nodes/MediaNodes'
import { MentionNode } from './nodes/MentionNode'
import { MermaidNode } from './nodes/MermaidNode'
import { NestedDocNode } from './nodes/NestedDocNode'
import { PollNode } from './nodes/PollNode'
import { RichQuoteNode } from './nodes/RichQuoteNode'
import { StepsNode } from './nodes/StepsNode'
import { TagNode } from './nodes/TagNode'
import { UnknownBlockNode, UnknownInlineNode } from './nodes/UnknownNodes'

export type EditorNode = Klass<LexicalNode> | LexicalNodeReplacement

/** Nodes every hakulex editor registers. */
export const builtinNodes: EditorNode[] = [
  HeadingNode,
  QuoteNode,
  RichQuoteNode,
  TagNode,
  CommentNode,
  MentionNode,
  ListNode,
  ListItemNode,
  LinkNode,
  AutoLinkNode,
  HorizontalRuleNode,
  CodeBlockNode,
  CodeSnippetNode,
  GalleryNode,
  LinkCardNode,
  PollNode,
  ChartNode,
  ChatNode,
  KaTeXInlineNode,
  KaTeXBlockNode,
  MermaidNode,
  ImageNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  AlertNode,
  BannerNode,
  DetailsNode,
  SpoilerNode,
  RubyNode,
  FootnoteNode,
  FootnoteSectionNode,
  VideoNode,
  FileNode,
  EmbedNode,
  DynamicNode,
  StepsNode,
  NestedDocNode,
  GridNode,
  UnknownBlockNode,
  UnknownInlineNode,
]
