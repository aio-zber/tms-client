export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-viber-purple-bg via-white to-gray-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo/Branding */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-viber-purple mb-2">
            GCG Team Chat
          </h1>
          <p className="text-gray-600 text-sm">
            Connect with your team instantly
          </p>
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
}
