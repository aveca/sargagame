# Autopilot — état documentaire mis à jour 2026-10-04

## État vérifié

- HEAD `main` : `54ba19ba2a8ccdafe42fa2d5ad81fa41d03c81e3`
- Self-healing : code présent avec réparation en worktree isolé et retry borné côté factory.
- Visual QA : la propagation de l'URL de preview est prévue dans la branche de correction ; ne pas considérer l'ancien fallback 4183 comme une preuve de production avant validation du commit correspondant.
- Cloudflare Production : workflow GitHub Actions présent et déploiement Worker prévu pour les cinq régions principales.
- Observabilité : sentinel live ajouté sur la branche de travail pour scanner production/GitHub/Cloudflare.
- Webhook Stripe : la parité des régions doit inclure Tulum ; un correctif correspondant est préparé.

## Règle

Aucun rapport « COMPLETE » ne doit être utilisé comme preuve à lui seul. La preuve doit venir des fichiers, commits, logs et statuts CI/production réellement observés.
