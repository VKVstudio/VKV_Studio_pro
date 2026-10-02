import { articles } from '#editorial-collection';
import type { EditorialAgentTool } from '../utils/editorial-agent-tools';

interface NativeModelContext {
  registerTool(tool: EditorialAgentTool, options: { signal: AbortSignal }): void | Promise<void>;
}

const registeredDocuments = new WeakSet<Document>();

export default defineNuxtPlugin({
  name: 'editorial-read-tools',
  async setup(nuxtApp): Promise<void> {
    let dispose: (() => void) | undefined;
    try {
      const currentDocument = document;
      const context = (currentDocument as Document & { modelContext?: NativeModelContext }).modelContext;
      if (!context || typeof context.registerTool !== 'function' || registeredDocuments.has(currentDocument)) return;
      const controllers = new Set<AbortController>();
      let disposed = false;
      dispose = (): void => {
        // An old app's repeated teardown must not remove a newer app's ownership.
        if (disposed) return;
        disposed = true;
        for (const controller of controllers) {
          try { controller.abort(); } catch {
            // A cleanup failure must not prevent cleanup of the remaining tools.
          }
        }
        controllers.clear();
        registeredDocuments.delete(currentDocument);
      };
      registeredDocuments.add(currentDocument);
      nuxtApp.vueApp.onUnmount(dispose);
      const appConfig = useAppConfig();
      // Browsers without the native API never request the tool-definition chunk.
      const { createEditorialAgentTools } = await import('../utils/editorial-agent-tools');
      if (disposed) return;
      const tools = createEditorialAgentTools({
        articles,
        publicRelease: appConfig.publicRelease,
        studioPreviewOrigin: appConfig.studioPreviewOrigin,
      });
      for (const tool of tools) {
        if (disposed) break;
        // Each registration owns its signal; one rejection cannot cancel other tools.
        const controller = new AbortController();
        controllers.add(controller);
        try {
          await context.registerTool(tool, { signal: controller.signal });
          if (disposed) controller.abort();
        } catch {
          controller.abort();
          controllers.delete(controller);
          // One rejected tool must not block the remaining tools or the page.
        }
      }
    } catch {
      dispose?.();
      // This optional enhancement must not affect browsers or disabled policies.
    }
  },
});
