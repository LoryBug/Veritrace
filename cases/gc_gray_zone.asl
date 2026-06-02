// GC-GRAY-ZONE: Cardiac CT gray zone with missing PET parameters.
// Expected behavior: mid risk, CT gray-zone decision, PET/CMR next-step plan, human review for missing PET parameters.

case(gc_gray_zone).

unavailable(gc_gray_zone, echo).
unavailable(gc_gray_zone, cmr).
available(gc_gray_zone, ct_pet).
unavailable(gc_gray_zone, pet).

ct_level(gc_gray_zone, gray_zone).

source(ct_pet_thresholds, dangelo_2020_ct_pet).
