import Login from "@/components/login";

export const metadata = {
  title: "Login",
};

const LoginPage = () => {
  return (
    <div className="min-h-svh flex items-center justify-center px-4 py-6 w-full">
      <Login />
    </div>
  );
};

export default LoginPage;
