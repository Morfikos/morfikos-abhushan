-- Allow Collections CSV exports on the same export_jobs table as sales/dues/inventory/Girvi.
ALTER TABLE app.export_jobs
  DROP CONSTRAINT IF EXISTS export_jobs_type_check;

ALTER TABLE app.export_jobs
  ADD CONSTRAINT export_jobs_type_check CHECK (
    export_type IN ('inventory', 'sales', 'dues', 'collections', 'girvi')
  );
