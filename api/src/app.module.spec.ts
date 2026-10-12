import { AdminController } from './admin/admin.controller';
import { AppModule, ClientAppModule } from './app.module';

type ModuleRef = { module?: unknown } | (abstract new (...args: never[]) => unknown);

function collectControllers(root: ModuleRef): Set<unknown> {
  const controllers = new Set<unknown>();
  const seen = new Set<unknown>();
  const visit = (ref: ModuleRef) => {
    const dynamic = typeof ref === 'object' ? ref : undefined;
    const target = dynamic?.module ?? ref;
    if (!target || seen.has(target)) return;
    seen.add(target);
    const imports: ModuleRef[] = [
      ...(Reflect.getMetadata('imports', target) ?? []),
      ...((dynamic as { imports?: ModuleRef[] })?.imports ?? []),
    ];
    for (const c of Reflect.getMetadata('controllers', target) ?? []) {
      controllers.add(c);
    }
    imports.forEach(visit);
  };
  visit(root);
  return controllers;
}

describe('AppModule split', () => {
  it('keeps admin routes out of the public client function', () => {
    expect(collectControllers(ClientAppModule).has(AdminController)).toBe(false);
    expect(collectControllers(AppModule).has(AdminController)).toBe(true);
  });
});
