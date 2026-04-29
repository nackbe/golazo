'use client';

import { useState, useTransition } from 'react';
import { Save, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateSystemSetting } from './actions';

interface Props {
  settings: Record<string, any>;
  settingsList: Array<{
    key: string;
    label: string;
    category: string;
    description: string;
  }>;
}

const categoryLabels: Record<string, string> = {
  rate_limit: 'Rate Limiting',
  game: 'Juego',
  cron: 'Cron',
  api: 'API',
};

export function SettingsForm({ settings, settingsList }: Props) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  const grouped = settingsList.reduce<Record<string, typeof settingsList>>((acc, s) => {
    if (!acc[s.category]) acc[s.category] = [];
    acc[s.category].push(s);
    return acc;
  }, {});

  function handleChange(key: string, value: string) {
    setEditedValues((prev) => ({ ...prev, [key]: value }));
    setFeedback(null);
  }

  function handleSave(key: string, category: string, description: string) {
    const valueStr = editedValues[key];
    if (!valueStr) return;

    setFeedback(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append('key', key);
      formData.append('value', valueStr);
      formData.append('category', category);
      formData.append('description', description);

      const result = await updateSystemSetting(formData);
      if (result.error) {
        setFeedback({ type: 'error', message: result.error });
      } else {
        setFeedback({ type: 'success', message: 'Guardado correctamente.' });
        setEditedValues((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    });
  }

  return (
    <div className="space-y-8">
      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          )}
          {feedback.message}
        </div>
      )}

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="rounded-2xl border border-border/50 bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">
            {categoryLabels[category] || category}
          </h2>

          <div className="space-y-4">
            {items.map((item) => {
              const currentValue = settings[item.key];
              const displayValue = currentValue ? JSON.stringify(currentValue, null, 2) : '{}';
              const editedValue = editedValues[item.key] ?? displayValue;
              const hasChanges = editedValues[item.key] !== undefined && editedValues[item.key] !== displayValue;

              return (
                <div key={item.key} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{item.label}</label>
                    <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {item.key}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                  <div className="flex gap-2">
                    <textarea
                      value={editedValue}
                      onChange={(e) => handleChange(item.key, e.target.value)}
                      rows={3}
                      className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                      spellCheck={false}
                    />
                    <Button
                      type="button"
                      disabled={isPending || !hasChanges}
                      onClick={() => handleSave(item.key, item.category, item.description)}
                      className="gap-1.5 self-start"
                      size="sm"
                    >
                      {isPending ? (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Guardar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
