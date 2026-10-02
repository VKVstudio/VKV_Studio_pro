import { articles } from '../data/articles';
import { editorialArticleSchema, editorialProfileSchema, serializeEditorialSchema, trustedEditorialScript } from '../utils/editorial-schema';

interface ScriptPolicy {
  createScript(value: string): unknown;
}
interface ScriptPolicyFactory {
  createPolicy(name: string, rules: { createScript(value: string): string }): ScriptPolicy;
}

export default defineNuxtPlugin({
  name: 'editorial-jsonld-trust',
  enforce: 'pre',
  dependsOn: ['nuxt:head'],
  setup(nuxtApp) {
    const allowed = new Set([
      serializeEditorialSchema(editorialProfileSchema),
      ...articles.map(article => serializeEditorialSchema(editorialArticleSchema(article))),
    ]);
    const factory = (window as Window & { trustedTypes?: ScriptPolicyFactory }).trustedTypes;
    const policy = factory?.createPolicy('vkv-pro-jsonld', {
      createScript: value => trustedEditorialScript(value, allowed),
    });
    const contents = new WeakMap<object, string>();
    const head = injectHead(nuxtApp);
    const hooks = head.hooks;
    if (!hooks) throw new Error('Editorial schema requires the client head hooks');
    hooks.hook('tags:afterResolve', ({ tags }) => {
      for (const tag of tags) {
        if (tag.tag !== 'script' || tag.key !== 'editorial-schema' || tag.props.type !== 'application/ld+json') continue;
        const body = tag.textContent ?? tag.innerHTML;
        if (typeof body !== 'string') throw new Error('Editorial schema content must be serialized JSON');
        contents.set(tag, trustedEditorialScript(body, allowed));
        // Prevent Unhead from invoking a raw script setter or its raw cleanup setter.
        delete tag.textContent;
        delete tag.innerHTML;
      }
    });
    hooks.hook('dom:rendered', ({ renders }) => {
      for (const render of renders) {
        const body = contents.get(render.tag);
        if (body === undefined) continue;
        const element = render.$el;
        if (!(element instanceof HTMLScriptElement) || element.type !== 'application/ld+json') throw new Error('Unexpected editorial schema element');
        // Keep the native TrustedScript brand until the DOM setter, after normalization.
        element.textContent = policy ? policy.createScript(body) as string : body;
      }
    });
  },
});
