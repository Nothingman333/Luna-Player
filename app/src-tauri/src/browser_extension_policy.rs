//! Keep one enabled copy of the bundled blocker; disabled copies and unrelated extensions stay intact.
pub fn duplicate_blockers<'a>(rows:impl IntoIterator<Item=(&'a str,&'a str,bool)>)->Vec<String>{
 let mut kept=false;
 rows.into_iter().filter_map(|(id,name,enabled)|{
  if !enabled||name!="uBlock Origin Lite"{return None}
  if kept{Some(id.to_string())}else{kept=true;None}
 }).collect()
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn keeps_one_and_disables_only_enabled_duplicates(){assert_eq!(duplicate_blockers([("off","uBlock Origin Lite",false),("first","uBlock Origin Lite",true),("other","Other",true),("second","uBlock Origin Lite",true)]),vec!["second"]);}
 #[test]fn respects_explicit_off(){assert!(duplicate_blockers([("off","uBlock Origin Lite",false)]).is_empty());}
 #[test]fn no_extension_or_one_needs_no_changes(){assert!(duplicate_blockers([]).is_empty());assert!(duplicate_blockers([("one","uBlock Origin Lite",true)]).is_empty());}
}
