import { useEffect, useState } from 'react';

import { Boxes, PackagePlus, X } from 'lucide-react';

import type { WorkflowExtensionDescriptor, WorkflowNodeKindSpec } from '../../lib/graph-types';
import { formatKindLabel } from '../../lib/graph-types';
import { Button } from '../ui/button';

interface ExtensionManagerProps {
  readonly extensions: ReadonlyArray<WorkflowExtensionDescriptor>;
  readonly isLoadingPackage: boolean;
  readonly nodeKinds: ReadonlyArray<WorkflowNodeKindSpec>;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onLoadPackage: (packageName: string) => void | Promise<unknown>;
}

export function ExtensionManager({
  extensions,
  isLoadingPackage,
  nodeKinds,
  open,
  onClose,
  onLoadPackage,
}: ExtensionManagerProps) {
  const [packageName, setPackageName] = useState('');

  useEffect(() => {
    if (!open) {
      setPackageName('');
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const normalizedPackageName = packageName.trim();

  return (
    <div
      aria-labelledby="extension-manager-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6"
      role="dialog"
    >
      <div className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Extensions</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950" id="extension-manager-title">Load installed node packs</h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Load an installed R package into the current Bayesgrove session, then inspect the node types and domain packs it registers.
            </p>
          </div>
          <Button
            aria-label="Close extensions"
            className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100"
            variant="ghost"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid gap-6 overflow-y-auto p-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <section className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
            <div className="flex items-center gap-2 text-slate-900">
              <PackagePlus className="size-4" />
              <h3 className="text-lg font-semibold">Load package</h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Glade does not install packages for you. Enter the name of an already installed extension package and Glade will run `library(...)` in the active session.
            </p>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-900">Package name</span>
              <input
                autoFocus
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-sky-500"
                placeholder="example.nodepack"
                value={packageName}
                onChange={(event) => setPackageName(event.target.value)}
              />
            </label>

            <Button
              className="mt-4 w-full"
              disabled={normalizedPackageName.length === 0 || isLoadingPackage}
              onClick={() => {
                if (!normalizedPackageName) {
                  return;
                }
                void onLoadPackage(normalizedPackageName);
              }}
            >
              {isLoadingPackage ? 'Sending load command…' : 'Load package'}
            </Button>
          </section>

          <section className="min-w-0">
            <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-slate-900">
                <Boxes className="size-4" />
                <h3 className="text-lg font-semibold">Available node kinds</h3>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                These are the node kinds currently exposed by the live Bayesgrove session, including core Bayesgrove modules and anything loaded from extension packages.
              </p>

              {nodeKinds.length === 0 ? (
                <div className="mt-4 rounded-[1.25rem] border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  No node kinds are exposed yet. Load a package or refresh the session once Bayesgrove has registered its modules.
                </div>
              ) : (
                <ul className="mt-4 grid gap-3 md:grid-cols-2">
                  {nodeKinds.map((nodeKind) => (
                    <li key={nodeKind.kind} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-900">{nodeKind.label}</span>
                        <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                          {formatKindLabel(nodeKind.kind)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{nodeKind.description}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-6 flex items-center gap-2 text-slate-900">
              <Boxes className="size-4" />
              <h3 className="text-lg font-semibold">Loaded extensions</h3>
            </div>

            {extensions.length === 0 ? (
              <div className="mt-4 rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
                No extensions are currently loaded. After you load a package, this panel updates from Bayesgrove&apos;s `extension_registry`.
              </div>
            ) : (
              <div className="mt-4 grid gap-4">
                {extensions.map((extension) => (
                  <article key={extension.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold text-slate-950">{extension.packageName}</h4>
                        <p className="mt-1 text-sm text-slate-500">
                          {extension.version ? `Version ${extension.version}` : 'Version unavailable'}
                        </p>
                      </div>
                      <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
                        {extension.nodeTypes.length} node type{extension.nodeTypes.length === 1 ? '' : 's'} · {extension.domainPackDetails.length} domain pack{extension.domainPackDetails.length === 1 ? '' : 's'}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-5 xl:grid-cols-2">
                      <section>
                        <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Node types</h5>
                        {extension.nodeTypes.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-600">This extension has not registered any node types.</p>
                        ) : (
                          <ul className="mt-3 space-y-3">
                            {extension.nodeTypes.map((nodeType) => (
                              <li key={`${extension.id}-${nodeType.kind}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-medium text-slate-900">{nodeType.title}</span>
                                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                    {formatKindLabel(nodeType.kind)}
                                  </span>
                                </div>
                                {nodeType.description ? (
                                  <p className="mt-2 text-sm text-slate-600">{nodeType.description}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>

                      <section>
                        <h5 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Domain packs</h5>
                        {extension.domainPackDetails.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-600">This extension has not registered any domain packs.</p>
                        ) : (
                          <ul className="mt-3 space-y-3">
                            {extension.domainPackDetails.map((domainPack) => (
                              <li key={`${extension.id}-${domainPack.id}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="font-medium text-slate-900">{domainPack.title}</span>
                                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                    {formatKindLabel(domainPack.kind ?? domainPack.id)}
                                  </span>
                                </div>
                                {domainPack.description ? (
                                  <p className="mt-2 text-sm text-slate-600">{domainPack.description}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </section>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
