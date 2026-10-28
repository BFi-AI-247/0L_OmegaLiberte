<?php
// Prüfbausteine für KI-Antworten (Kanon Basis, #103). Nur Funktionen, keine Ausgabe; eingebunden von kurator.php.
declare(strict_types=1);

// #103 (Kanon B7 „wörtlich übernehmen, nicht präzisieren“): Jede Zahl im Lage-Satz muss in Titel oder Anriss eines seiner Beiträge stehen.
// Tausenderpunkte zählen nicht („1.000“ = „1000“); sonst gilt die Zahl genau so, wie sie im Beitrag steht.
function zahlen_tokens(string $s): array {
    preg_match_all('/(?<![\w.,])\d+(?:[.,]\d+)*(?!\d)/u', $s, $m);
    $aus = [];
    foreach ($m[0] as $z) { $z = rtrim($z, '.,'); $aus[$z] = 1; if (preg_match('/^\d{1,3}(?:\.\d{3})+$/', $z)) $aus[str_replace('.', '', $z)] = 1; }
    return $aus;
}
function zahlen_belegt(string $satz, array $texte): bool {
    $im = zahlen_tokens(implode(' ', $texte));
    foreach (array_keys(zahlen_tokens($satz)) as $z) if (!isset($im[(string)$z])) return false;
    return true;
}
