/**
 * Chat Layout
 * The main layout already provides the conversation list, so this layout just passes through the children.
 */

export default function ChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
