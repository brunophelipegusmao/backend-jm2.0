export class AuthGuard {
  canActivate() {
    return true;
  }
}

export const AllowAnonymous = () => () => undefined;
export const Session = () => () => undefined;

export type UserSession = {
  user?: { id?: string; email?: string };
};

class AuthModuleStub {}

export const AuthModule = {
  forRoot() {
    return {
      module: AuthModuleStub,
    };
  },
};
