//! #184: the shared Postgres container outlived every test run. The reaper removes a container
//! once the process it watches exits.
#![expect(clippy::expect_used, reason = "tests fail loudly on setup errors")]

mod support;

use std::process::Command;
use std::time::{Duration, Instant};

use testcontainers_modules::postgres::Postgres;
use testcontainers_modules::testcontainers::ImageExt;
use testcontainers_modules::testcontainers::runners::SyncRunner;

fn exists(container_id: &str) -> bool {
    Command::new("docker")
        .args(["inspect", container_id])
        .output()
        .expect("run docker inspect")
        .status
        .success()
}

#[test]
fn issue_184_reaper_removes_the_container_after_the_process_exits() {
    let container = Postgres::default()
        .with_tag("17-alpine")
        .start()
        .expect("start Postgres; is Docker running?");
    let id = container.id().to_owned();
    // Keep the handle from stopping the container, as a static would.
    std::mem::forget(container);

    let mut watched = Command::new("sleep").arg("1").spawn().expect("spawn sleep");
    support::reap_after(watched.id(), &id);
    assert!(exists(&id), "the container runs while the process does");
    watched.wait().expect("wait for sleep");

    let deadline = Instant::now() + Duration::from_secs(20);
    while exists(&id) {
        assert!(Instant::now() < deadline, "container {id} was not removed");
        std::thread::sleep(Duration::from_millis(250));
    }
}
