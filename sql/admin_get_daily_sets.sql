-- Sort today→future (ASC) so today is always at the top of the list.
CREATE OR REPLACE FUNCTION admin_get_daily_sets()
RETURNS TABLE (
  id             uuid,
  set_date       date,
  title          text,
  is_published   boolean,
  created_at     timestamptz,
  question_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    ds.id           AS id,
    ds.set_date     AS set_date,
    ds.title        AS title,
    ds.is_published AS is_published,
    ds.created_at   AS created_at,
    COUNT(dsq.id)   AS question_count
  FROM daily_sets ds
  LEFT JOIN daily_set_questions dsq ON dsq.daily_set_id = ds.id
  GROUP BY ds.id, ds.set_date, ds.title, ds.is_published, ds.created_at
  ORDER BY ds.set_date ASC;  -- today first, future last
END;
$$;

GRANT EXECUTE ON FUNCTION admin_get_daily_sets() TO authenticated;
