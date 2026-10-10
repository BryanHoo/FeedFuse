interface AiSummaryInlineTextProps {
  text: string;
}

export default function AiSummaryInlineText({ text }: AiSummaryInlineTextProps) {
  // 捕获成对的 ** 标记，将文本拆成普通片段与加粗片段；未闭合的流式片段继续原样显示。
  const parts = text.split(/(\*\*[^\r\n]+?\*\*)/g);

  // 使用 React 文本节点保留原文和空格，避免将模型输出的 HTML 当作页面元素执行。
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-bold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}
