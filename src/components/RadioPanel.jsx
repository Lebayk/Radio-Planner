import React from 'react';
import { Field, NumberInput, Select, Banner } from './ui.jsx';
import { useI18n } from '../lib/i18n.js';
import {
  LORA_PRESETS,
  REGIONS,
  REGION_BY_ID,
  PRESET_BY_ID,
  DEVICES,
  DEVICE_BY_ID,
  deviceSupportsFreq,
  erp,
  eirp,
  erpLimitFor,
} from '../lib/radio.js';

export default function RadioPanel({ radio, onChange, onApplyDevice, maxGain }) {
  const { t } = useI18n();
  // Toute saisie manuelle d une valeur issue d un profil materiel fait
  // repasser la selection en "personnalise" : afficher un nom de materiel
  // dont les caracteristiques ont ete modifiees serait trompeur.
  const set = (patch) => onChange({ ...radio, ...patch, device: 'custom' });
  // Les reglages sans lien avec le materiel n ont pas a le desellectionner.
  const setNeutral = (patch) => onChange({ ...radio, ...patch });
  const region = REGION_BY_ID[radio.region];
  const preset = PRESET_BY_ID[radio.preset];
  const device = DEVICE_BY_ID[radio.device] ?? DEVICE_BY_ID.custom;
  const freqOutOfBand = !deviceSupportsFreq(radio.device, radio.freq);

  // Libelles et notes traduits par id, la table radio.js restant une source
  // de donnees neutre (pas de texte en dur specifique a une langue).
  const deviceLabel = (id) => t(`radio.deviceLabel.${id}`);
  const deviceSummary = (id) => t(`radio.deviceSummary.${id}`);
  const deviceNote = (id) => t(`radio.deviceNote.${id}`);
  const regionLabel = (id) => t(`radio.region.${id}.label`);
  const regionNote = (id) => t(`radio.region.${id}.note`);

  const erpVal = erp(radio.power, maxGain, radio.cableLoss);
  const eirpVal = eirp(radio.power, maxGain, radio.cableLoss);
  const limit = erpLimitFor(radio.region, radio.freq);
  const over = erpVal > limit + 1e-9;

  return (
    <div className="space-y-3">
      <Field label={t('radio.device')}>
        <Select
          value={radio.device}
          onChange={onApplyDevice}
          options={DEVICES.map((d) => ({ value: d.id, label: deviceLabel(d.id) }))}
        />
      </Field>

      {!device.custom && (
        <div className="rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2 text-[11px] leading-relaxed">
          {device.summary && <p className="text-zinc-400">{deviceSummary(device.id)}</p>}
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-zinc-300">
            <span>
              {device.power} dBm
              {device.estimatedPower && <span className="text-amber-400/80"> *</span>}
            </span>
            <span>
              {device.gain} dBi
              {device.estimatedGain && <span className="text-amber-400/80"> *</span>}
            </span>
            <span>
              {device.freqMin} - {device.freqMax} MHz
            </span>
          </p>
          <p className="mt-1.5 text-zinc-600">
            {(device.estimatedPower || device.estimatedGain) && (
              <span className="text-amber-400/80">{t('radio.estimatedNote')}</span>
            )}
            {deviceNote(device.id)}
          </p>
        </div>
      )}

      {freqOutOfBand && (
        <Banner tone="error" title={t('radio.outOfBand')}>
          {t('radio.outOfBandMsg', { freq: radio.freq, min: device.freqMin, max: device.freqMax })}
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Field label={t('radio.region')}>
          <Select
            value={radio.region}
            onChange={(v) => {
              const r = REGION_BY_ID[v];
              setNeutral({ region: v, freq: v === 'CUSTOM' ? radio.freq : r.freq });
            }}
            options={REGIONS.map((r) => ({ value: r.id, label: regionLabel(r.id) }))}
          />
        </Field>
        <Field label={t('radio.freq')}>
          <NumberInput
            value={radio.freq}
            onChange={(v) => setNeutral({ freq: v, region: 'CUSTOM' })}
            min={100}
            max={3000}
            suffix="MHz"
            invalid={freqOutOfBand}
          />
        </Field>
      </div>

      <Field
        label={t('radio.preset')}
        hint={t('radio.presetHint', { sens: preset.sens, sf: preset.sf, bw: preset.bw })}
      >
        <Select
          value={radio.preset}
          onChange={(v) => setNeutral({ preset: v })}
          options={LORA_PRESETS.map((p) => ({
            value: p.id,
            label: `${p.label}  (${p.sens} dBm)`,
          }))}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t('radio.txPower')}>
          <NumberInput value={radio.power} onChange={(v) => set({ power: v })} min={-10} max={33} suffix="dBm" invalid={over} />
        </Field>
        <Field label={t('radio.cableLoss')}>
          <NumberInput value={radio.cableLoss} onChange={(v) => set({ cableLoss: v })} min={0} max={20} suffix="dB" />
        </Field>
      </div>

      <div
        className={`rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
          over ? 'border-rose-500/50 bg-rose-500/10' : 'border-ink-500/70 bg-ink-900/50'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">{t('radio.eirp')}</span>
          <span className={`font-mono ${over ? 'text-rose-300' : 'text-zinc-300'}`}>{eirpVal.toFixed(1)} dBm</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">{t('radio.erp')}</span>
          <span className={`font-mono ${over ? 'font-semibold text-rose-300' : 'text-zinc-300'}`}>
            {erpVal.toFixed(1)} dBm
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">{t('radio.limit', { region: regionLabel(region.id) })}</span>
          <span className="font-mono text-zinc-400">{limit} dBm ERP</span>
        </div>
        {over && (
          <p className="mt-1.5 font-medium text-rose-300">
            {t('radio.overLimit', { db: (erpVal - limit).toFixed(1) })}
          </p>
        )}
        <p className="mt-1.5 text-zinc-600">
          {t('radio.gainBasis', { gain: maxGain })}
          {regionNote(region.id)}
        </p>
      </div>

      <Field label={t('radio.desiredMargin')} hint={t('radio.desiredMarginHint')}>
        <NumberInput value={radio.desiredMargin} onChange={(v) => setNeutral({ desiredMargin: v })} min={0} max={40} suffix="dB" />
      </Field>

      <div className="rounded-lg border border-ink-500/60 bg-ink-900/40 p-2.5">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-500">{t('radio.relayHardware')}</p>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('radio.relayGain')}>
            <NumberInput value={radio.relayGain} onChange={(v) => set({ relayGain: v })} min={-6} max={25} suffix="dBi" />
          </Field>
          <Field label={t('radio.relayPower')}>
            <NumberInput value={radio.relayPower} onChange={(v) => set({ relayPower: v })} min={-10} max={33} suffix="dBm" />
          </Field>
        </div>
        <p className="mt-1.5 text-[11px] leading-snug text-zinc-600">{t('radio.relayNote')}</p>
      </div>

      {radio.freq < 400 && <Banner tone="warn">{t('radio.unusualFreq')}</Banner>}
    </div>
  );
}
