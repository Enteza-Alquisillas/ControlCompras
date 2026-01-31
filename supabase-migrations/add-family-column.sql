-- Add family field to articles table
ALTER TABLE articles ADD COLUMN IF NOT EXISTS family TEXT;

-- Update the optimized stock breakage function to include family (optional but good for consistency)
-- Not strictly needed for the requested task but helps if we want to group by family in availability too.
